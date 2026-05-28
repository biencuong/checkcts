// Cấu hình PM2 cho CheckCTS web (dùng trên aaPanel / server Linux).
// Chạy:  pm2 start ecosystem.config.js  &&  pm2 save
module.exports = {
  apps: [
    {
      name: 'checkcts-web',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3900,
        // QUAN TRỌNG: đổi khóa nội bộ này trước khi chạy thật (dùng cho /api/history).
        CHECKCTS_ADMIN_KEY: 'DOI_KHOA_NAY',
        // (Tùy chọn) chỉ định font tiếng Việt cho báo cáo PDF nếu hệ thống không có sẵn:
        // CHECKCTS_FONT: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        // CHECKCTS_FONT_BOLD: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      },
    },
  ],
};
