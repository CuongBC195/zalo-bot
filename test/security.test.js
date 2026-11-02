/**
 * Kiểm thử Bảo mật Toàn diện (Security Audit Test Suite)
 * Kiểm tra các cơ chế phòng vệ theo chuẩn Cloudflare Security Audit:
 *  1. Chống đánh cắp & tái sử dụng cookie (Session Hijacking, Device/Browser/IP Binding)
 *  2. Thu hồi phiên phía Server ngay khi Logout, Đổi mật khẩu, Khóa hoặc Xóa tài khoản
 *  3. Chống leo thang đặc quyền (Privilege Escalation) trên /api/users
 *  4. Chống giả mạo X-Forwarded-For vượt Rate Limiter & Chống dò tên tài khoản (Username Enumeration)
 *  5. Bảo vệ /api/webhook/status, Fail-closed cho Webhook/Cron trên Production & CSP Headers
 *  6. Chống Excel Formula Injection (CSV/XLSX Injection) khi xuất Sổ công văn
 */

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';
process.env.OFFICE_AI_REWRITE = 'false';

const assert = require('assert');
const XLSX = require('xlsx');
const db = require('../src/db');
const app = require('../src/admin/server');
const officeRoutes = require('../src/admin/office-routes');

// Ép chạy trên bộ nhớ dự phòng để kiểm thử nhanh, cô lập và ổn định 100%
db.pool = null;
db.isConnected = false;

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

function extractTokenCookie(res) {
  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  for (const sc of setCookies) {
    const m = /token=([^;]+)/.exec(sc);
    if (m && m[1]) return { cookieHeader: `token=${m[1]}`, rawSetCookie: sc };
  }
  return { cookieHeader: '', rawSetCookie: setCookies.join('; ') };
}

async function run() {
  console.log('\n=== Kiểm thử Bảo mật & Quản lý Phiên (Security Test Suite) ===');

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function req(method, urlPath, { body, headers = {} } = {}) {
    const opts = {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${base}${urlPath}`, opts);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    return { status: res.status, headers: res.headers, data, ...extractTokenCookie(res) };
  }

  try {
    // ============================================================
    // 1. KIỂM THỬ CHỐNG ĐÁNH CẮP COOKIE (DEVICE / BROWSER / IP BINDING)
    // ============================================================
    await test('Login không lộ JWT trong JSON body và thiết lập Cookie HttpOnly + SameSite=Strict', async () => {
      app._resetLoginRateLimiter();
      const loginRes = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0',
          'X-Device-Key': 'device-mac-chrome-001',
        },
      });
      assert.strictEqual(loginRes.status, 200);
      assert.strictEqual(loginRes.data.ok, true);
      assert.strictEqual(loginRes.data.token, undefined, 'Không được trả raw JWT token trong JSON body');
      assert(loginRes.cookieHeader.startsWith('token='), 'Phải trả về cookie token');
      assert(/HttpOnly/i.test(loginRes.rawSetCookie), 'Cookie phải có cờ HttpOnly');
      assert(/SameSite=Strict/i.test(loginRes.rawSetCookie), 'Cookie phải có cờ SameSite=Strict');

      // Dùng đúng thiết bị và trình duyệt -> thành công
      const meOk = await req('GET', '/api/auth/me', {
        headers: {
          Cookie: loginRes.cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0',
          'X-Device-Key': 'device-mac-chrome-001',
        },
      });
      assert.strictEqual(meOk.status, 200);
      assert.strictEqual(meOk.data.user.username, 'admin');
    });

    await test('Chép cookie sang trình duyệt/máy khác (khác User-Agent) bị từ chối 401 và thu hồi phiên', async () => {
      app._resetLoginRateLimiter();
      const loginRes = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0',
          'X-Device-Key': 'device-mac-chrome-002',
        },
      });
      assert.strictEqual(loginRes.status, 200);

      // Dán cookie sang máy Windows / trình duyệt khác
      const replayDiffUa = await req('GET', '/api/auth/me', {
        headers: {
          Cookie: loginRes.cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130.0.0.0',
          'X-Device-Key': 'device-mac-chrome-002',
        },
      });
      assert.strictEqual(replayDiffUa.status, 401, 'Phải chặn cookie dùng trên User-Agent khác');

      // Phiên gốc cũng đã bị thu hồi để bảo vệ tài khoản
      const originalAfterTheft = await req('GET', '/api/auth/me', {
        headers: {
          Cookie: loginRes.cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0',
          'X-Device-Key': 'device-mac-chrome-002',
        },
      });
      assert.strictEqual(originalAfterTheft.status, 401, 'Phiên bị nghi ngờ đánh cắp phải bị thu hồi ngay');
    });

    await test('Chép cookie sang cửa sổ ẩn danh / máy khác cùng hệ điều hành & cùng mạng (thiếu hoặc khác X-Device-Key) bị chặn 401', async () => {
      app._resetLoginRateLimiter();
      const sameUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0';
      const loginRes = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
        headers: {
          'User-Agent': sameUa,
          'X-Device-Key': 'browser-instance-original-key-1234567890',
        },
      });
      assert.strictEqual(loginRes.status, 200);

      // Kẻ tấn công chép cookie từ DevTools dán sang trình duyệt khác (cùng User-Agent, cùng IP nhưng không có Device Key trong localStorage)
      const replayNoDeviceKey = await req('GET', '/api/auth/me', {
        headers: {
          Cookie: loginRes.cookieHeader,
          'User-Agent': sameUa,
          'X-Device-Key': 'browser-instance-other-machine-9999999999',
        },
      });
      assert.strictEqual(replayNoDeviceKey.status, 401, 'Phải chặn ngay cả khi cùng IP và cùng User-Agent nhưng khác Device Key');
    });

    await test('Người dùng thật đổi mạng IP (Wi-Fi <-> 4G) hoặc trình duyệt tự nâng cấp bản vá nhỏ vẫn giữ nguyên phiên (200 OK)', async () => {
      process.env.TRUST_PROXY = 'true';
      try {
        app._resetLoginRateLimiter();
        const dKey = 'device-key-roaming-001';

        const loginRes = await req('POST', '/api/auth/login', {
          body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.6723.58',
            'X-Device-Key': dKey,
            'X-Real-IP': '203.0.113.10',
          },
        });
        assert.strictEqual(loginRes.status, 200);

        // Chuyển sang mạng 4G (IP mới) và trình duyệt tự cập nhật minor version (.58 -> .70)
        const roamingRes = await req('GET', '/api/auth/me', {
          headers: {
            Cookie: loginRes.cookieHeader,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.6723.70',
            'X-Device-Key': dKey,
            'X-Real-IP': '198.51.100.77',
          },
        });
        assert.strictEqual(roamingRes.status, 200, 'Đổi IP hợp lệ trên cùng thiết bị không được làm văng phiên');
      } finally {
        delete process.env.TRUST_PROXY;
      }
    });

    await test('Khi bật STRICT_SESSION_IP=true, đổi mạng IP bị chặn 401 ngay lập tức', async () => {
      process.env.TRUST_PROXY = 'true';
      process.env.STRICT_SESSION_IP = 'true';
      try {
        app._resetLoginRateLimiter();
        const ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0';
        const dKey = 'device-key-ip-test-001';

        const loginRes = await req('POST', '/api/auth/login', {
          body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
          headers: {
            'User-Agent': ua,
            'X-Device-Key': dKey,
            'X-Real-IP': '203.0.113.10',
          },
        });
        assert.strictEqual(loginRes.status, 200);

        // Dùng từ IP khác khi đang bật STRICT_SESSION_IP=true
        const replayDiffIp = await req('GET', '/api/auth/me', {
          headers: {
            Cookie: loginRes.cookieHeader,
            'User-Agent': ua,
            'X-Device-Key': dKey,
            'X-Real-IP': '198.51.100.77',
          },
        });
        assert.strictEqual(replayDiffIp.status, 401, 'Phải chặn khi địa chỉ IP thay đổi ở chế độ STRICT_SESSION_IP=true');
      } finally {
        delete process.env.TRUST_PROXY;
        delete process.env.STRICT_SESSION_IP;
      }
    });

    // ============================================================
    // 2. THU HỒI PHIÊN TRÊN SERVER KHI LOGOUT / ĐỔI MẬT KHẨU / KHÓA USER
    // ============================================================
    await test('Sau khi Logout, cookie cũ đã chép trước đó không thể dùng lại (401)', async () => {
      app._resetLoginRateLimiter();
      const ctxHeaders = {
        'User-Agent': 'Mozilla/5.0 Chrome/130',
        'X-Device-Key': 'logout-test-device',
      };
      const loginRes = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
        headers: ctxHeaders,
      });
      const savedCookie = loginRes.cookieHeader;

      const logoutRes = await req('POST', '/api/auth/logout', {
        headers: { ...ctxHeaders, Cookie: savedCookie },
      });
      assert.strictEqual(logoutRes.status, 200);

      const replayAfterLogout = await req('GET', '/api/auth/me', {
        headers: { ...ctxHeaders, Cookie: savedCookie },
      });
      assert.strictEqual(replayAfterLogout.status, 401, 'Cookie sau khi logout phải bị vô hiệu hóa trên server');
    });

    await test('Đổi mật khẩu thu hồi ngay lập tức mọi cookie cũ và cấp cookie mới cho thiết bị hiện tại', async () => {
      app._resetLoginRateLimiter();
      const defaultPass = process.env.ADMIN_PASSWORD || 'Admin@123456';
      const tempPass = 'NewSecurePass@2026';
      const ctxHeaders = {
        'User-Agent': 'Mozilla/5.0 Chrome/130',
        'X-Device-Key': 'pwd-change-device',
      };

      const loginRes = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: defaultPass },
        headers: ctxHeaders,
      });
      const oldCookie = loginRes.cookieHeader;

      // Đổi mật khẩu
      const changeRes = await req('PUT', '/api/auth/change-password', {
        body: { currentPassword: defaultPass, newPassword: tempPass },
        headers: { ...ctxHeaders, Cookie: oldCookie },
      });
      assert.strictEqual(changeRes.status, 200);
      const newCookie = changeRes.cookieHeader;
      assert(newCookie && newCookie !== oldCookie, 'Phải cấp lại cookie phiên mới');

      // Cookie cũ không còn hiệu lực
      const checkOld = await req('GET', '/api/auth/me', {
        headers: { ...ctxHeaders, Cookie: oldCookie },
      });
      assert.strictEqual(checkOld.status, 401, 'Cookie cũ trước khi đổi mật khẩu phải bị thu hồi');

      // Cookie mới hoạt động bình thường
      const checkNew = await req('GET', '/api/auth/me', {
        headers: { ...ctxHeaders, Cookie: newCookie },
      });
      assert.strictEqual(checkNew.status, 200);

      // Đổi trả lại mật khẩu gốc để không ảnh hưởng các test sau
      const revertRes = await req('PUT', '/api/auth/change-password', {
        body: { currentPassword: tempPass, newPassword: defaultPass },
        headers: { ...ctxHeaders, Cookie: newCookie },
      });
      assert.strictEqual(revertRes.status, 200);
    });

    // ============================================================
    // 3. CHỐNG LEO THANG ĐẶC QUYỀN (PRIVILEGE ESCALATION) & KHÓA TÀI KHOẢN
    // ============================================================
    await test('Admin thường không thể tự nâng quyền lên superadmin hoặc sửa/xóa tài khoản superadmin', async () => {
      app._resetLoginRateLimiter();
      const superHeaders = {
        'User-Agent': 'SuperAdmin-Browser',
        'X-Device-Key': 'super-dev-key',
      };
      const superLogin = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@123456' },
        headers: superHeaders,
      });
      const superAuth = { ...superHeaders, Cookie: superLogin.cookieHeader };

      // Superadmin tạo 1 tài khoản admin cấp dưới
      const subAdminUser = await db.createUser({
        username: 'subadmin_sec_test',
        password: 'SubAdmin@123',
        fullName: 'Quản trị viên cấp dưới',
        role: 'admin',
      });

      const subHeaders = {
        'User-Agent': 'SubAdmin-Browser',
        'X-Device-Key': 'sub-dev-key',
      };
      const subLogin = await req('POST', '/api/auth/login', {
        body: { username: 'subadmin_sec_test', password: 'SubAdmin@123' },
        headers: subHeaders,
      });
      assert.strictEqual(subLogin.status, 200);
      const subAuth = { ...subHeaders, Cookie: subLogin.cookieHeader };

      // 1. Admin cấp dưới cố tạo tài khoản superadmin -> 403
      const createSuper = await req('POST', '/api/users', {
        body: { username: 'hacker_super', password: 'Password@123', role: 'superadmin' },
        headers: subAuth,
      });
      assert.strictEqual(createSuper.status, 403);

      // 2. Admin cấp dưới cố tự nâng role của mình lên superadmin -> 403
      const promoteSelf = await req('PUT', `/api/users/${subAdminUser.id}`, {
        body: { role: 'superadmin' },
        headers: subAuth,
      });
      assert.strictEqual(promoteSelf.status, 403);

      // 3. Admin cấp dưới cố khóa hoặc đổi mật khẩu của superadmin (id=1) -> 403
      const attackSuper = await req('PUT', '/api/users/1', {
        body: { isActive: false },
        headers: subAuth,
      });
      assert.strictEqual(attackSuper.status, 403);

      // 4. Admin cấp dưới cố xóa superadmin (id=1) -> 403
      const deleteSuper = await req('DELETE', '/api/users/1', {
        headers: subAuth,
      });
      assert.strictEqual(deleteSuper.status, 403);

      // 5. Khi Superadmin khóa tài khoản subadmin_sec_test -> cookie của subadmin bị vô hiệu hóa ngay lập tức
      const lockSub = await req('PUT', `/api/users/${subAdminUser.id}`, {
        body: { isActive: false },
        headers: superAuth,
      });
      assert.strictEqual(lockSub.status, 200);

      const subMeAfterLock = await req('GET', '/api/auth/me', {
        headers: subAuth,
      });
      assert.strictEqual(subMeAfterLock.status, 401, 'Khóa tài khoản phải thu hồi phiên ngay lập tức');
    });

    // ============================================================
    // 3b. MA TRẬN PHÂN QUYỀN: QUẢN TRỊ TỐI CAO / QUẢN TRỊ VIÊN / VĂN THƯ / CÁN BỘ
    // ============================================================
    await test('Ma trận phân quyền: Văn thư chỉ thêm/sửa sổ; Quản trị viên thêm/sửa/xóa nhưng chỉ quản lý Văn thư + Cán bộ; Quản trị tối cao toàn quyền', async () => {
      app._resetLoginRateLimiter();
      const login = async (username, password, tag) => {
        const headers = { 'User-Agent': `RBAC-${tag}`, 'X-Device-Key': `rbac-${tag}` };
        const r = await req('POST', '/api/auth/login', { body: { username, password }, headers });
        assert.strictEqual(r.status, 200, `Đăng nhập ${username} phải thành công`);
        return { ...headers, Cookie: r.cookieHeader };
      };
      const denied = (r) => r.status === 403;
      const allowed = (r) => r.status !== 401 && r.status !== 403;

      const superAuth = await login('admin', process.env.ADMIN_PASSWORD || 'Admin@123456', 'super');
      const adminA = await db.createUser({ username: 'rbac_admin_a', password: 'Admin@123', role: 'admin' });
      const adminB = await db.createUser({ username: 'rbac_admin_b', password: 'Admin@123', role: 'admin' });
      const clerk = await db.createUser({ username: 'rbac_clerk', password: 'Clerk@123', role: 'clerk' });
      const viewer = await db.createUser({ username: 'rbac_user', password: 'User@1234', role: 'user' });
      const superUser = await db.getUserByUsername('admin');

      const adminAuth = await login('rbac_admin_a', 'Admin@123', 'admin');
      const clerkAuth = await login('rbac_clerk', 'Clerk@123', 'clerk');
      const userAuth = await login('rbac_user', 'User@1234', 'user');

      // ---------- SỔ CÔNG VĂN ----------
      // Thêm (body rỗng -> người có quyền nhận 400 do kiểm tra dữ liệu, người không quyền nhận 403)
      for (const [who, auth] of [['superadmin', superAuth], ['admin', adminAuth], ['clerk', clerkAuth]]) {
        const add = await req('POST', '/api/office-docs', { body: {}, headers: auth });
        assert(allowed(add), `${who} phải được THÊM văn bản (nhận ${add.status})`);
        const edit = await req('PUT', '/api/office-docs/1', { body: {}, headers: auth });
        assert(allowed(edit), `${who} phải được SỬA văn bản (nhận ${edit.status})`);
        const imp = await req('POST', '/api/office-docs/import', { body: { fileName: 'x.txt' }, headers: auth });
        assert(allowed(imp), `${who} phải được NHẬP Excel (nhận ${imp.status})`);
        const imports = await req('GET', '/api/office-docs/imports', { headers: auth });
        assert(allowed(imports), `${who} phải xem được lịch sử nhập (nhận ${imports.status})`);
        const dash = await req('GET', '/api/office-docs/dashboard', { headers: auth });
        assert(allowed(dash), `${who} phải xem được Tổng quan (nhận ${dash.status})`);
      }
      // Xóa văn bản: chỉ quản trị
      assert(allowed(await req('DELETE', '/api/office-docs/1', { headers: superAuth })), 'superadmin phải được XÓA văn bản');
      assert(allowed(await req('DELETE', '/api/office-docs/1', { headers: adminAuth })), 'admin phải được XÓA văn bản');
      assert(denied(await req('DELETE', '/api/office-docs/1', { headers: clerkAuth })), 'Văn thư KHÔNG được xóa văn bản');
      // Cán bộ chỉ tra cứu
      assert(denied(await req('POST', '/api/office-docs', { body: {}, headers: userAuth })), 'Cán bộ không được thêm');
      assert(denied(await req('PUT', '/api/office-docs/1', { body: {}, headers: userAuth })), 'Cán bộ không được sửa');
      assert(denied(await req('DELETE', '/api/office-docs/1', { headers: userAuth })), 'Cán bộ không được xóa');
      assert(denied(await req('POST', '/api/office-docs/import', { body: { fileName: 'x.xlsx' }, headers: userAuth })), 'Cán bộ không được nhập Excel');

      // ---------- VĂN THƯ KHÔNG ĐỤNG ĐƯỢC NGƯỜI DÙNG / ZALO / CẤU HÌNH ----------
      for (const [m, p, body] of [
        ['GET', '/api/users'],
        ['POST', '/api/users', { username: 'x_clerk_new', password: 'Abc@1234', role: 'user' }],
        ['PUT', `/api/users/${viewer.id}`, { fullName: 'hack' }],
        ['DELETE', `/api/users/${viewer.id}`],
        ['GET', '/api/zalo-users'],
        ['GET', '/api/zalo-activation-codes'],
        ['POST', '/api/zalo-activation-codes', { staffLabel: 'x' }],
        ['GET', '/api/query-logs'],
        ['POST', '/api/cache/clear'],
        ['POST', '/api/seed-db'],
        ['GET', '/api/documents'],
        ['POST', '/api/rag-test', { query: 'test' }],
        ['POST', '/api/pipeline-test', { query: 'test' }],
      ]) {
        const r = await req(m, p, { body, headers: clerkAuth });
        assert(denied(r), `Văn thư phải bị chặn ${m} ${p} (nhận ${r.status})`);
      }

      // /api/stats chỉ trả trạng thái kết nối DB cho Văn thư / Cán bộ, không lộ số lượng tài khoản
      const clerkStats = await req('GET', '/api/stats', { headers: clerkAuth });
      assert.strictEqual(clerkStats.status, 200);
      assert.strictEqual(clerkStats.data.stats, undefined, 'Không lộ stats cho Văn thư');

      // Chặn username chứa ký tự lạ/XSS và mật khẩu quá dài (chống Bcrypt DoS)
      const badUser = await req('POST', '/api/users', {
        body: { username: '<script>x</script>', password: 'Abc@1234', role: 'user' },
        headers: adminAuth,
      });
      assert.strictEqual(badUser.status, 400, 'Phải chặn username chứa ký tự không hợp lệ');
      const longPwd = await req('POST', '/api/users', {
        body: { username: 'valid_user_99', password: 'A'.repeat(200), role: 'user' },
        headers: adminAuth,
      });
      assert.strictEqual(longPwd.status, 400, 'Phải chặn mật khẩu vượt quá 128 ký tự');

      // ---------- QUẢN TRỊ VIÊN: CHỈ QUẢN LÝ VĂN THƯ + CÁN BỘ ----------
      const mkClerk = await req('POST', '/api/users', { body: { username: 'rbac_new_clerk', password: 'Abc@1234', role: 'clerk' }, headers: adminAuth });
      assert.strictEqual(mkClerk.status, 200, 'admin phải tạo được Văn thư');
      const mkUser = await req('POST', '/api/users', { body: { username: 'rbac_new_user', password: 'Abc@1234', role: 'user' }, headers: adminAuth });
      assert.strictEqual(mkUser.status, 200, 'admin phải tạo được Cán bộ');
      assert(denied(await req('POST', '/api/users', { body: { username: 'rbac_new_admin', password: 'Abc@1234', role: 'admin' }, headers: adminAuth })), 'admin KHÔNG được tạo admin');
      assert(denied(await req('POST', '/api/users', { body: { username: 'rbac_new_super', password: 'Abc@1234', role: 'superadmin' }, headers: adminAuth })), 'admin KHÔNG được tạo superadmin');

      assert.strictEqual((await req('PUT', `/api/users/${clerk.id}`, { body: { fullName: 'Văn thư mới' }, headers: adminAuth })).status, 200, 'admin sửa được Văn thư');
      assert.strictEqual((await req('PUT', `/api/users/${mkUser.data.user.id}`, { body: { role: 'clerk' }, headers: adminAuth })).status, 200, 'admin đổi Cán bộ -> Văn thư được');
      assert(denied(await req('PUT', `/api/users/${mkClerk.data.user.id}`, { body: { role: 'admin' }, headers: adminAuth })), 'admin KHÔNG được nâng Văn thư lên admin');
      assert(denied(await req('PUT', `/api/users/${adminB.id}`, { body: { fullName: 'x' }, headers: adminAuth })), 'admin KHÔNG được sửa admin khác');
      assert(denied(await req('PUT', `/api/users/${adminB.id}`, { body: { role: 'user' }, headers: adminAuth })), 'admin KHÔNG được hạ quyền admin khác');
      assert(denied(await req('PUT', `/api/users/${superUser.id}`, { body: { isActive: false }, headers: adminAuth })), 'admin KHÔNG được khóa superadmin');
      assert(denied(await req('PUT', `/api/users/${adminA.id}`, { body: { role: 'superadmin' }, headers: adminAuth })), 'admin KHÔNG được tự nâng quyền');
      assert.strictEqual((await req('PUT', `/api/users/${adminA.id}`, { body: { fullName: 'Tự sửa tên' }, headers: adminAuth })).status, 200, 'admin tự sửa hồ sơ của mình được');
      assert(denied(await req('DELETE', `/api/users/${adminB.id}`, { headers: adminAuth })), 'admin KHÔNG được xóa admin khác');
      assert(denied(await req('DELETE', `/api/users/${superUser.id}`, { headers: adminAuth })), 'admin KHÔNG được xóa superadmin');
      assert.strictEqual((await req('DELETE', `/api/users/${mkClerk.data.user.id}`, { headers: adminAuth })).status, 200, 'admin xóa được Văn thư');
      assert.strictEqual((await req('DELETE', `/api/users/${mkUser.data.user.id}`, { headers: adminAuth })).status, 200, 'admin xóa được Cán bộ');

      // ---------- QUẢN TRỊ TỐI CAO: TOÀN QUYỀN (trừ tự hạ quyền chính mình) ----------
      const mkAdmin = await req('POST', '/api/users', { body: { username: 'rbac_super_made_admin', password: 'Abc@1234', role: 'admin' }, headers: superAuth });
      assert.strictEqual(mkAdmin.status, 200, 'superadmin tạo được admin');
      assert.strictEqual((await req('PUT', `/api/users/${adminB.id}`, { body: { role: 'clerk' }, headers: superAuth })).status, 200, 'superadmin đổi vai trò admin được');
      assert.strictEqual((await req('DELETE', `/api/users/${mkAdmin.data.user.id}`, { headers: superAuth })).status, 200, 'superadmin xóa được admin');
      assert(denied(await req('PUT', `/api/users/${superUser.id}`, { body: { role: 'user' }, headers: superAuth })), 'superadmin KHÔNG được tự hạ quyền (tránh mất Quản trị tối cao)');

      // Văn thư được xem Ý kiến chuyển/chỉ đạo (người nhập liệu), Cán bộ thì không
      const sampleDoc = { id: 1, so_ky_hieu: '1-CV/ĐU', y_kien_chuyen: 'nội bộ', y_kien_chi_dao: 'nội bộ' };
      assert.strictEqual(officeRoutes._sanitizeDoc(sampleDoc, { role: 'clerk' }).y_kien_chuyen, 'nội bộ');
      assert.strictEqual(officeRoutes._sanitizeDoc(sampleDoc, { role: 'user' }).y_kien_chuyen, undefined);

      for (const u of [adminA, adminB, clerk, viewer]) await db.deleteUser(u.id);
    });

    // ============================================================
    // 4. CHỐNG BYPASS RATE LIMITER QUA X-FORWARDED-FOR & USERNAME ENUMERATION
    // ============================================================
    await test('Không thể giả mạo X-Forwarded-For để vượt qua Rate Limiter đăng nhập (chặn 429 ở lần thứ 6)', async () => {
      app._resetLoginRateLimiter();

      for (let i = 1; i <= 5; i++) {
        const failRes = await req('POST', '/api/auth/login', {
          body: { username: `nonexistent_user_${i}`, password: 'WrongPassword123' },
          headers: { 'X-Forwarded-For': `10.99.0.${i}` },
        });
        assert.strictEqual(failRes.status, 401);
        assert.strictEqual(
          failRes.data.error,
          'Tên đăng nhập hoặc mật khẩu không chính xác.',
          'Thông báo lỗi phải đồng nhất để chống dò tên tài khoản'
        );
      }

      // Lần thứ 6 dù đổi X-Forwarded-For sang IP giả mới vẫn bị chặn 429
      const sixthRes = await req('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'WrongPassword123' },
        headers: { 'X-Forwarded-For': '10.99.0.250' },
      });
      assert.strictEqual(sixthRes.status, 429, 'Phải chặn 429 ở lần thử thứ 6 bất chấp X-Forwarded-For giả mạo');
      app._resetLoginRateLimiter();
    });

    // ============================================================
    // 5. BẢO VỆ ENDPOINT NỘI BỘ, WEBHOOK SECRET & SECURITY HEADERS
    // ============================================================
    await test('Chặn truy cập trái phép /api/webhook/status và kiểm tra CSP + Fail-closed trên Production', async () => {
      const unauthWebhookStatus = await req('GET', '/api/webhook/status');
      assert.strictEqual(unauthWebhookStatus.status, 401, '/api/webhook/status phải yêu cầu đăng nhập');
      assert(
        unauthWebhookStatus.headers.get('content-security-policy')?.includes("default-src 'self'"),
        'Phải có header Content-Security-Policy'
      );

      // Kiểm tra Fail-closed khi chạy ở chế độ Production mà thiếu ZALO_WEBHOOK_SECRET / CRON_SECRET
      const prevEnv = process.env.NODE_ENV;
      const prevCron = process.env.CRON_SECRET;
      process.env.NODE_ENV = 'production';
      delete process.env.CRON_SECRET;
      try {
        const webhookSpoof = await req('POST', '/api/webhook', {
          body: { event_name: 'message.text.received', message: { text: 'test' } },
        });
        assert.strictEqual(webhookSpoof.status, 403, 'Webhook phải fail-closed (403) trên Production khi thiếu secret');

        const cronNoSecret = await req('GET', '/api/cron/keepalive');
        assert.strictEqual(cronNoSecret.status, 401, 'Cron keepalive phải fail-closed (401) trên Production khi thiếu CRON_SECRET');
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevCron !== undefined) process.env.CRON_SECRET = prevCron;
      }
    });

    // ============================================================
    // 6. CHỐNG EXCEL FORMULA INJECTION KHI XUẤT SỔ CÔNG VĂN
    // ============================================================
    await test('Vô hiệu hóa công thức độc hại (=, +, -, @) khi xuất file Excel Sổ công văn', async () => {
      const maliciousDocs = [
        {
          direction: 'den',
          source_id: '9001',
          so_ky_hieu: '=CMD|\' /C calc\'!A0',
          ngay_van_ban: '2026-10-20',
          ngay_den: '2026-10-20',
          the_loai: '+SUM(1,1)',
          trich_yeu: '-2+3+cmd',
          nguoi_ky: '@SUM(1,1)',
          nguoi_gui: '\t=HYPERLINK("http://evil.tld")',
          so_van_ban: 'Sổ văn bản đến',
          do_khan: 'Thường',
          han_xu_ly: '',
          trang_thai_xu_ly: '',
          so_trang: 1,
          so_ban: 1,
        },
      ];

      const buf = officeRoutes._buildExportWorkbook(maliciousDocs, { direction: 'den', columns: {} });
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const dataRow = rows[5];

      assert(dataRow.includes("'=CMD|' /C calc'!A0"), 'Ô bắt đầu bằng = phải được thêm dấu nháy đơn');
      assert(dataRow.includes("'+SUM(1,1)"), 'Ô bắt đầu bằng + phải được thêm dấu nháy đơn');
      assert(dataRow.includes("'-2+3+cmd"), 'Ô bắt đầu bằng - phải được thêm dấu nháy đơn');
      assert(dataRow.includes("'@SUM(1,1)"), 'Ô bắt đầu bằng @ phải được thêm dấu nháy đơn');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n[Security] ${passed} kiểm thử bảo mật đạt.\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
