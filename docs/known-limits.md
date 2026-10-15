# Giới hạn đã biết

Mỗi mục: dòng đầu là giới hạn, dòng sau là việc làm.

**Intake.** Mới chỉ stage intake chạy hết với model thật. P13 dừng ở trần lượt intake (2026-10-13): writer bỏ sót đoạn nguồn nguyên văn qua 3 lượt sửa; sửa prompt writer là việc P14.
Coi các stage sau là chưa chứng minh. Việc quickstart không nêu thì dừng và hỏi kit owner.

**Thời gian.** Đo đêm 2026-10-12: spec nhỏ tới gate intake mất 18 phút; spec thật (P13, ~17 KB) mất 30–75 phút cho intake, một lượt review Grok khoảng 8 phút. Các stage sau chưa đo.
Dành 30–75 phút cho mỗi stage trên spec thật. Lệnh mẫu không ghi `--timeout-ms`: wrapper mặc định 1500000 ms (25 phút), runner 1800000 ms (30 phút) cho mỗi lần gọi. Đặt timeout runner nhỏ hơn wrapper thì runner cắt trước, thoát 4; số không tự tăng.

**design và uiux.** Hai stage tắt mặc định. Bật uiux khi thiếu design, tdd hoặc `design_system` thì thoát 3.
Để tắt ở lần chạy đầu. Muốn bật thì hỏi kit owner. Thiếu file `context/design/` cũng thoát 3.

**Timeout trên macOS.** Provider tự tạo session (`setsid` hoặc process tách) có thể sống sót sau timeout của runner. D48 ghi đây là giới hạn, không sửa thêm.
Sau thoát 4, process đó có thể còn chạy. Không kill process không nhận ra. Hỏi kit owner.

**Stderr của provider.** Wrapper `tools/agents/*` vẫn bỏ stderr của CLI provider, dù `SPEC.md` mục 6 yêu cầu giữ trong log. Wrapper là input của gate, nên sửa nó làm gate đã duyệt thành stale khi upgrade; chờ kit owner quyết.
Khi thoát 4 từ wrapper và log `review/log/*-stderr.txt` chỉ có một dòng, chạy lại CLI provider trong terminal để đọc lỗi. Lệnh tác tử project tự khai báo thì stderr đã được giữ trong log (đã loại secrets).
Loại secrets là theo mẫu (URL userinfo, header `Authorization`, token `sk-`/`gh*_`/`github_pat_`, `name: value` với tên chứa key/token/secret/password, khối PEM). Secret có hình dạng khác thì không bị che; không dán dữ liệu nhạy cảm vào stderr của lệnh tác tử.

**Runtime state cũ sau upgrade.** `repair_entry` trong `review/runtime/<stage>.json` đổi từ chuỗi (hoặc `foreign` dạng mảng đường dẫn) sang `{key, foreign}` với `foreign` là map `{path: sha256}`. Stage đang dở với state cũ vào lại repair đúng một lần ở lần chạy đầu sau upgrade (tốn tối đa một fix round, vẫn trong cap; đếm vẫn audit). Sau đó dùng định dạng mới.

**`.kit-upgrade.lock`.** Lock đang có thì `init --upgrade` thoát 3, in pid, giờ bắt đầu, và `looks live` hoặc `looks exited`. Không đổi lock. Không có cờ `--break-stale-lock` (D48).
Xác nhận process đã thoát, xóa `<project>/.kit-upgrade.lock`, chạy lại. Câu in ra: `confirm that process has exited, then delete <file> and rerun`. Đang `looks live` thì không xóa.

**Không hạ cấp.** Kit cũ hơn version hoặc commit đã ghi thì thoát 3: `Refusing kit downgrade: recorded <version> (<commit>), source <version> (<commit>)`.
Dùng archive mới hơn, hoặc hỏi kit owner. Không có cờ bỏ qua.
Archive không có git, nên runner chỉ so được version. Hai archive cùng version (ví dụ cùng `2.0.0`) không xếp được thứ tự theo commit. Luôn dùng archive mới nhất kit owner phát.

**Nâng cấp dở.** Rollback khi lệnh lỗi đã có. Mất điện giữa chừng, và việc đọc project song song lúc upgrade, chưa được kiểm (`tools/run/README.md`).
Không upgrade khi process khác đang đọc project. Mất điện giữa chừng thì hỏi kit owner trước khi chạy lại.

**Nâng cấp giữa stage.** Wrapper là input; đổi kit khi stage đang chạy làm đổi input đã ghi, nên lần chạy sau viết lại stage và dùng một lượt fix.
Nâng cấp giữa các stage khi có thể.

**`kit.lock.json`.** Checksum bắt sửa inventory. Nó không phải chữ ký trước người viết lại cả file.
Doctor báo `current`, `drift` hoặc `unknown`. Đừng coi lock là bằng chứng không ai sửa cả bản ghi.

**Trần lượt.** `limits.max_fix_rounds` và `review.max_rounds` mặc định là 3. Mỗi PO `decide.mjs --continue --reason "<text>"` thêm một lượt đúng scope; counters không reset, kể cả sau restart hoặc xóa projection.
Đọc review file và chạy lệnh recovery runner in, hoặc dừng stage. Không xóa `review/` để đếm lại. Continuation hết hạn sau 30 ngày, không bỏ qua quality floors.

**Quyền continuation.** Nội dung file exception không gắn hash với quyết định PO; người sửa được file project cũng tự khai được bất kỳ email PO nào (`asserted-local`).
Không cho người khác sửa `review/`.

**Grok.** Grok chỉ làm reviewer. `--writer grok` và `--agent grok` thoát 3.
Dùng `--reviewer grok` với `--writer codex` hoặc `--writer claude`.

**`not-built`.** `--build not-built` dành cho spec trước code và giữ G4 ở trạng thái chờ. UIUX đang tắt nên G4 chưa nằm trên đường mặc định.
Chỉ dùng `not-built` khi chưa có code. Bản UI thật cần revision build thật. Hỏi kit owner trước khi bật `uiux`.

**Không git.** Archive phát hành không kèm git (D49). Ngoài git, thiếu `--head` thì thoát 3.
Giữ `--head fresh-source` cho đến khi project nằm trong git. Không tự đặt commit.

**Playwright.** Thiếu Chromium thì doctor in `NOT RUN`, không thoát 1. Ảnh reader không chạy được.
Làm theo câu doctor: `set PLAYWRIGHT_FROM=<directory containing node_modules/playwright>, then run npx playwright install chromium there`. Bỏ qua được nếu chưa cần ảnh.

**Đổi membership.** Thêm, xóa hoặc đổi tên id trong scope thì dừng `scope-version-required` (thoát 2). Đổi nội dung cùng membership không đòi definition mới.
Dừng. Không viết tay file definition. Hỏi kit owner.

**Một sản phẩm, một project.** D43: một sản phẩm là một project, nhiều feature theo thời gian. Không có sổ chung giữa hai sản phẩm. Sổ quyết định kiểu D44 (`authority`, `affects`) chưa được dựng (sau P13).
Giữ một sản phẩm trong một `<dir>`. Đừng chờ các trường D44.

**Lời của model.** D42: lời "xong" của model không phải bằng chứng.
Chỉ tin mã thoát, file gate, và quyết định của PO.

**Ai duyệt gate.** Chỉ email trong `roles.po.approvers` chạy được `decide.mjs`. `roles.qc` và `roles.dev` chưa có danh sách approver.
Thêm email dưới `roles.po.approvers` trong `<dir>/config/pipeline.yaml`. Đừng thêm khóa `approvers` vào `qc` hoặc `dev`.

**`--as`.** `--as <po-email>` là danh tính tự khai trên máy (asserted-local), không phải authentication.
PO trong `roles.po.approvers` tự chạy `decide.mjs`, hoặc chọn trong tool hỏi người dùng của `/spec:gate` ngay phiên đó để agent ghi bằng `--confirmed-via ask-user`. Channel tự khai, không xác thực. Ngoài đường này agent không chạy decide và không thêm `--as`.

**Cài đặt.** Claude marketplace là đường chính; archive mỏng vẫn dùng được. Claude install trong scratch đã đạt, nhưng model smoke báo chưa đăng nhập.
Đọc bảng host và smoke trong README. Không coi install là bằng chứng model đã chạy; không tự đăng nhập thay PO.

**Trả lời câu hỏi làm rõ.** `/spec:clarify` ghi câu trả lời PO qua tool hỏi người dùng vào `input/answers.md`; runner đọc nguồn này, không tương tác với PO trong writer headless. Wiring và source binding đã kiểm bằng fixture, chưa chứng minh một phiên PO/model clarify thật trên mỗi host.
Không sửa tay generated `spec/decisions/decisions.md`. Không có tool hỏi thì đợi câu trả lời chat và để PO tự ghi nguồn; không ghi channel tool từ chat thường.

**Wireframe/prototype.** Bật mặc định và có gate PO riêng, nhưng chưa chạy với model thật. Proof manual/fixture chỉ chứng minh đường đi runner và lint, không chứng minh chất lượng model.
PO kiểm mọi screen/US/AC và state trước duyệt. Prototype lo-fi offline; nghiệm thu UI thật vẫn ở uiux (tắt mặc định).

**Nâng cấp 2.0.2.** Upgrade thêm wireframe/prototype mặc định bật, giữ byte gate intake–us và quyết định. Context tdd/handoff đổi nên gate của chúng thành stale khi chạy lại; definitions có version mới.
Đọc `--dry-run` trước. PO thêm token path có thật vào prototype context khi muốn dùng DS.

**Nguồn câu trả lời khi nâng cấp.** Upgrade thêm bảng `input/answers.md` nếu chưa có và context cho các stage sau intake đọc decisions. File câu trả lời đã có được giữ nguyên. Gate intake và approver giữ đúng byte; clarify/later gates thành stale khi context đổi.
Xem dry-run, đọc lại các gate stale; không coi giữ byte trước traversal là phê duyệt còn mới.
