# Báo cáo Buổi 10 — Giao diện mới + Hôm nay / Quá hạn

- Nhánh `claude/m10-ui-polish` (từ `main` `d240831`). **Không đổi** `supabase/`, auth, tầng dữ liệu, `main.tsx`, `vercel.json`, `package.json`.

## Thay đổi
- **Bố cục:** sidebar (logo, điều hướng Bảng / Hôm nay / Quá hạn có bộ đếm, danh sách “Bảng của bạn”); trên mobile cùng thanh điều hướng thành tab bar dưới cùng (mỗi điều khiển chỉ render một lần).
- **Thanh trên:** chọn bảng + tạo/tùy chỉnh bảng + tìm/lọc (chỉ ở view Bảng), trạng thái “Đang lưu…”, avatar tài khoản luôn hiện.
- **Thị giác:** nền navy `#0E1221`, font Be Vietnam Pro, màu trạng thái có nghĩa (amber hôm nay, coral quá hạn, mint hoàn thành), bán kính phân cấp; cột có icon trạng thái; thẻ có mô tả rút gọn, badge ưu tiên có chấm màu, badge hạn “Hôm nay / Ngày mai / Trễ N ngày”; trạng thái rỗng có hướng dẫn; hộp thoại bo lớn hơn, tiêu đề đậm.
- **Tính năng:** view **Hôm nay** (hạn = hôm nay, chưa xong) và **Quá hạn** (hạn < hôm nay, chưa xong) gom từ mọi bảng; mở task để sửa (tự chuyển bảng đang mở); nút tròn đánh dấu hoàn thành (chuyển về cuối cột Hoàn thành của đúng bảng, qua hàng đợi ghi có hoàn tác); khóa khi offline.
- **Đã thay:** nút lọc “Hôm nay” cũ trên bảng và dải tóm tắt được thay bằng view Hôm nay (tránh hai khái niệm trùng tên). Hàm lọc domain cũ vẫn giữ.

## Kiểm thử (Supabase Local, lần chạy cuối)
| Tầng | Kết quả |
|---|---|
| `npm run check` | 139/139 (thêm 18 test: `focusTasks`, `daysBetween`, `formatLongDate`, `completeTask`, view + điều hướng) |
| `npm run test:db` | 58/58 |
| `npm run test:integration` | 8/8 |
| `npm run test:e2e` | 19/19 (thêm 3 desktop + 1 mobile cho Hôm nay/Quá hạn), hai lượt liên tiếp |
| `check:secrets` | OK |

Sửa trong lúc làm: `h1` bị ẩn trên mobile (thiếu heading cho trình đọc màn hình) → giữ trong cây a11y (`max-md:sr-only`).

## Chưa kiểm
- Chưa kiểm trên Vercel Preview / Supabase Cloud / Google thật cho nhánh này.

Ảnh: `docs/screenshots/m10-*.png`.
