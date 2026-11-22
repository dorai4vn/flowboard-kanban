# Báo cáo Buổi 10 — Giao diện productivity dashboard + Hôm nay / Quá hạn

- Nhánh `claude/m10-ui-polish` (từ `main` `d240831`, sau khi merge Buổi 9). PR nháp: dorai4vn/flowboard-kanban#3 (không merge).
- **Không đổi** `supabase/`, mã `src/auth`, `src/lib`, `src/data`, `src/main.tsx`, `vercel.json` (chỉ thêm một test trong
  `src/auth/AuthGate.test.tsx`). `package.json` chỉ thêm script `qc:screens`; `index.html` đổi font.

## Thay đổi giao diện
- **Bố cục:** sidebar (logo, điều hướng Bảng / Hôm nay / Quá hạn có bộ đếm, “Bảng của bạn”, “Thêm bảng”); trên mobile cùng
  thanh điều hướng thành tab bar dưới cùng, có vạch chỉ báo tab hiện tại. Mỗi điều khiển chỉ render một lần.
- **Thanh trên:** chọn bảng + tạo/tùy chỉnh + tìm/lọc (view Bảng), “Đang lưu…”, avatar tài khoản luôn hiện.
- **Tổng quan bảng:** thanh tiến độ 3 đoạn theo cột, % hoàn thành, số việc đến hạn hôm nay / quá hạn của bảng; bảng rỗng có hướng dẫn.
- **Thị giác:** nền navy `#0E1221`, font Be Vietnam Pro, màu trạng thái có nghĩa (amber hôm nay, coral quá hạn, mint hoàn thành),
  bán kính phân cấp; cột có icon trạng thái; thẻ có mô tả rút gọn, badge ưu tiên, badge hạn “Hôm nay / Ngày mai / Trễ N ngày”;
  trạng thái rỗng có lời hướng dẫn; hộp thoại gọn, hàng tạo nhãn mới gom nhóm.
- **Khả năng tiếp cận:** màu chữ phụ nâng lên `#8189a2` (≥ 4.5:1 trên mọi nền), `h1` vẫn có trên mobile, focus bàn phím
  được giữ sau khi hoàn thành/dời hạn, không còn heading nằm trong nút.

## Tính năng Hôm nay / Quá hạn (gom từ mọi bảng)
- **Hôm nay:** việc có hạn hôm nay chưa xong; tiến độ “Đã xong x/y”; nhóm “Đến hạn hôm nay, đã xong”; lối tắt “Xem N việc quá hạn”;
  hoàn thành một chạm; mở việc để sửa (tự chuyển sang bảng chứa việc).
- **Quá hạn:** việc quá hạn chưa xong, nhóm “Trễ hơn 1 tuần / Trễ 2–7 ngày / Trễ 1 ngày”; “Dời sang hôm nay” và “Đánh dấu hoàn thành”.
- Mọi thao tác đi qua hàng đợi ghi sẵn có (lỗi → hoàn tác + thông báo); khóa khi offline.
- Nút lọc “Hôm nay” cũ trên bảng được thay bằng view Hôm nay.

## Kiểm thử thực tế (Supabase Local, lần chạy cuối)
| Tầng | Kết quả |
|---|---|
| `npm run check` (lint + typecheck + unit/component + build) | **160/160** (24 file) |
| `npm run test:db` (pgTAP RLS/RPC) | **58/58** |
| `npm run test:integration` (2 user, cô lập dữ liệu) | **8/8** |
| `npm run test:e2e` (desktop + mobile) | **19/19**, hai lượt liên tiếp (2 spec chụp ảnh QC bỏ qua theo thiết kế) |
| `npm run check:secrets` | OK |
| Vercel Preview (PR #3) | build **thành công** (trạng thái “Deployment has completed”) |

Regression đã kiểm: đăng nhập (AuthGate + E2E phiên), cô lập tài khoản (pgTAP, integration, E2E đổi tài khoản, test mới
“đổi tài khoản khi đang ở Hôm nay”), CRUD, kéo thả chuột/bàn phím, lưu và tải lại, offline.

## Visual QC
Ảnh trong `docs/screenshots/m10/` (desktop 1440px, mobile 412px): Bảng, Hôm nay, Quá hạn, hộp thoại tạo/sửa, với dữ liệu
thử tiêu đề rất dài, trễ 10/3/1 ngày, việc đã xong. Chạy lại: `npm run qc:screens`.

Lỗi tìm thấy và đã sửa: dashboard bị che do trang tự cuộn khi chụp (lỗi script); tab mobile hiện tại khó nhận ra; tiêu đề dài bị cắt
1 dòng trên mobile (giờ 2 dòng); hàng tạo nhãn tách rời; độ tương phản chữ phụ 3.6:1 (giờ ≥ 4.5:1); thiếu `h1` trên mobile.

## Review độc lập
Không có Critical/Important. Đã sửa (có test hồi quy): Hủy “Thêm bảng” làm mất view hiện tại; `h3` trong `button`;
mất focus sau hoàn thành/dời hạn; nhãn nhóm đã xong dễ hiểu sai; câu “0% … trên 0 công việc”; viewport 1000px chỉ áp cho test kéo thả chuột;
bổ sung test đổi tài khoản khi ở Hôm nay và test hoàn tác cho hoàn thành/dời hạn.

Hoãn (Minor): lỗi “dời hạn” khi chưa sẵn sàng không có thông báo (nút đã bị khóa khi offline); hai nhãn “Thêm bảng”/“Bảng mới” cho cùng hành động;
mã `todayMode` cũ trong domain chưa dọn.

## Rủi ro còn lại
- Chưa nghiệm thu thủ công trên Preview với Google OAuth + Supabase Cloud (cần URL Preview trong Redirect URLs của Supabase).
- Ô chọn ngày dùng định dạng của trình duyệt (ảnh tự động hiện mm/dd/yyyy; trình duyệt tiếng Việt hiện dd/mm/yyyy).
- `today` không tự đổi khi để app mở qua nửa đêm (có từ trước).
- Kéo thả gần mép màn hình sẽ tự cuộn (hành vi của dnd-kit) — đúng chủ ý, nhưng màn hình thấp có thể cảm thấy “nhảy”.
