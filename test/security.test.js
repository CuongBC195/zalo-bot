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

    await test('Chép cookie sang mạng IP khác (khi bật TRUST_PROXY) bị chặn 401 ngay lập tức', async () => {
      process.env.TRUST_PROXY = 'true';
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

        // Dùng từ IP khác dù có đủ User-Agent và X-Device-Key
        const replayDiffIp = await req('GET', '/api/auth/me', {
          headers: {
            Cookie: loginRes.cookieHeader,
            'User-Agent': ua,
            'X-Device-Key': dKey,
            'X-Real-IP': '198.51.100.77',
          },
        });
        assert.strictEqual(replayDiffIp.status, 401, 'Phải chặn khi địa chỉ IP thay đổi');
      } finally {
        delete process.env.TRUST_PROXY;
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
