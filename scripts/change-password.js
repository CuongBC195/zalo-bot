/**
 * CLI Script: Đổi mật khẩu tài khoản Admin
 * Cách dùng: node scripts/change-password.js <new_password>
 *      Hoặc: node scripts/change-password.js <username> <new_password>
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function main() {
  const args = process.argv.slice(2);
  let username = process.env.ADMIN_USERNAME || 'admin';
  let newPassword = '';

  if (args.length === 1) {
    newPassword = args[0];
  } else if (args.length >= 2) {
    username = args[0];
    newPassword = args[1];
  }

  if (!newPassword || newPassword.length < 6) {
    console.error('❌ Mật khẩu mới phải có ít nhất 6 ký tự.');
    console.error('   Cách dùng: npm run change-password <mat_khau_moi>');
    console.error('   Ví dụ:     npm run change-password MatKhau@BaoMat2026');
    process.exit(1);
  }

  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.error('❌ Không thể kết nối tới cơ sở dữ liệu. Vui lòng kiểm tra DATABASE_URL trong .env.');
    process.exit(1);
  }

  console.log(`🔒 Đang mã hóa mật khẩu mới bằng thuật toán bcrypt (salt round = 10)...`);
  const hash = await bcrypt.hash(newPassword, 10);

  const res = await db.pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = $2 RETURNING id, username, full_name',
    [hash, username]
  );

  if (res.rows.length === 0) {
    console.error(`❌ Không tìm thấy tài khoản "${username}" trong cơ sở dữ liệu!`);
    process.exit(1);
  }

  console.log(`✅ Đã đổi mật khẩu thành công cho tài khoản "${username}"!`);
  console.log(`🔐 Mật khẩu đã được mã hóa 1 chiều an toàn trong PostgreSQL/Supabase.`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi khi đổi mật khẩu:', err.message);
  process.exit(1);
});
