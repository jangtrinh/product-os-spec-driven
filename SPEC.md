# PRODUCT:OS Spec Driven

Tài liệu này quy định sản phẩm kit. [Spec Format v2](format/SPEC-FORMAT-v2.md) quy định dữ liệu mà công cụ đọc. [Source map](format/source-map.md) ghi phần giữ, chuyển và bỏ từ hai nguồn. [Mô hình gate](format/gate-model.md) quy định vòng sửa và phạm vi duyệt. [Mô hình thiết kế](format/design-model.md) quy định nguồn thiết kế, DS và bằng chứng. Các lệnh và đường dẫn dưới đây là giao diện phải xây của kit. Bản SPEC không chứng minh các công cụ đã chạy. [Danh mục quan hệ](format/reference-registry.json) là danh sách đóng mà lint và runner phải cùng đọc.

## 1. Mục tiêu

PO viết thông tin spec. Kit tạo contract, PRD, US, thiết kế, scenario, test và giao diện mẫu từ nội dung đó. Người duyệt xem kết quả và bằng chứng của đúng phiên bản trước khi đồng ý bàn giao. Dev và QA đọc cùng một nguồn qua các trang sinh riêng cho vai trò của họ.

Project mới nhận template, quy tắc, công cụ Node và cấu hình. Người chạy chọn model qua lệnh CLI. Người chỉ có giao diện chat dùng chế độ manual. Kit chạy trên file, không phụ thuộc Orca hay nhà cung cấp model.

## 2. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| thông tin spec | Nội dung PO viết trong input/po-spec.md để bắt đầu project |
| contract | Cam kết phạm vi và luật sản phẩm. Product Contract áp cho sản phẩm. Feature Contract áp cho một phần bàn giao |
| template | Khung tài liệu, nội dung bắt buộc và phép kiểm đi kèm. Tên này thay nghĩa contract của baseline |
| PRD / REQ | Tài liệu yêu cầu sản phẩm và mã yêu cầu trong bảng của tài liệu |
| US / AC / BR | User Story, điều kiện nghiệm thu, quy tắc nghiệp vụ. AC có Given, When và Then |
| lớp build | Contract, PRD, US và bảng truy vết. Đây là nguồn để xây và kiểm |
| lớp readable | Trang release, epic và capability sinh từ lớp build qua epic-map.json |
| scenario / SCN | Một ca xác minh AC, có cách kiểm, trạng thái và test khi kiểm tự động |
| acceptance-test-first | Viết scenario và kết quả mong đợi trước khi xây hành vi |
| TDD | Chạy test đỏ vì thiếu hành vi, viết code để test xanh, rồi sửa cấu trúc code mà test vẫn xanh |
| UIUX | Giao diện mẫu React, TypeScript strict của project |
| ui-contract | Bảng màn hình, route, US, tên phần tử, loại phần tử và SCN dùng phần tử. Viết trước code UI |
| design system / token | Bộ component và giá trị giao diện có tên cho màu, chữ, khoảng cách |
| stage / ngữ cảnh | Một bước của pipeline và danh sách file bước đó nhận |
| PO / QC / Dev | Người phụ trách sản phẩm, người kiểm thử, người xây. QA là tên trang đọc cho QC |
| gate | Điểm kiểm có mã, phiên bản, phạm vi, người quyết định và bằng chứng. File stage giữ quyết định tổng hợp |
| Change Set / phạm vi ảnh hưởng | Bản thay đổi từ baseline đang dùng / các đầu ra phụ thuộc cần kiểm lại |
| bản ghi bằng chứng | Kết quả kiểm gắn đúng artifact, build, nguồn, scenario, công cụ và thời điểm |
| bộ duyệt HTML | Một file reader sinh từ thay đổi, liệt kê US/AC và cho PO xuất quyết định theo lô |
| eval / review / finding | Phép kiểm kết quả, lượt đọc theo rubric, vấn đề có dẫn chứng mà reviewer nêu |
| tác tử viết / tác tử review | Model tạo kết quả / model đọc nguồn và chấm kết quả ở phiên riêng, chỉ đọc |
| manual | Runner in prompt, người chạy dùng chat rồi đưa đường dẫn file kết quả cho runner |
| glossary / sổ quyết định | Thuật ngữ có nguồn và từ cấm / quyết định, mặc định đang chờ xác nhận, câu hỏi còn mở |
| OPEN / CURRENT / STALE | Câu hỏi chưa trả lời / bằng chứng thuộc bản đang xét / bằng chứng đã cũ sau thay đổi |

## 3. Phạm vi

Kit gồm format, schema, template, quy tắc viết, rubric, prompt, cấu hình, lint, runner, reader, migration và bộ eval. Reader sinh trang PO, Dev, QA, Open items và ma trận coverage. Migration chuyển bản v1 trên bản sao. Adapter cho runtime ngoài chỉ gọi công cụ của kit.

Kit mới được quản lý trong repo Git local và GitHub riêng tư. Các giai đoạn triển khai tiếp tục trong phạm vi đã duyệt và dừng khi cần quyết định sản phẩm thật. Kit tạo tài liệu, test và UI mẫu. Kit không xây backend, API hay kết nối production của sản phẩm. AC về các phần đó vẫn được giữ, nêu người phụ trách, cách kiểm dự kiến và dòng “not verified in production”. Không coi phần chưa xây là đã nghiệm thu.

Quyết định duyệt nằm trong file gate. Kit không gửi thông báo, không đặt gate trên dịch vụ ngoài và không tự publish. UI mẫu dùng dữ liệu đã được project cho phép và nêu giới hạn mô phỏng. Tên người trong tài liệu là email hoặc vai trò. Không lưu secrets. Công cụ lõi chạy offline trên Node 18 trở lên.

## 4. Quy trình

### 4.1. Các stage

| Thứ tự / stage | Kết quả | Chủ mặc định | Bật mặc định |
|---|---|---|---|
| 1 intake | spec/manifest, bản gốc thông tin PO và phân loại trong intake/ | PO | có |
| 2 clarify | câu hỏi, phương án, quyết định trong decisions/ | PO | có |
| 3 contract | Product/Feature Contract và amendment trong contract/ | PO | có |
| 4 prd | PRD có REQ và phân rã US trong prd/ | PO | có |
| 5 us | us/INDEX.md, US 1–6, epic-map, trang readable dẫn xuất | PO | có |
| 6 wireframe | một file wireframe/wireframes.md: SCR ids, US/AC, flows và ASCII normal/empty/error/loading hoặc N/A reason | PO | có |
| 7 prototype | một file prototype/index.html offline, anchors-only, US/AC theo wireframe, grey lo-fi hoặc DS tokens được cấp | PO | có |
| 8 design | màn hình, component, dữ liệu, lỗi trong ux/design.md; ux/ui-contract.md | Dev | không |
| 9 tdd | scenario có cấu trúc trong US; ca kiểm trong tests/cases/; test tự động khi đã chọn auto | QC | có |
| 10 uiux | UI mẫu trong ui/, kết quả test và bằng chứng | PO | không |
| 11 handoff | manifest bàn giao bất biến, phạm vi và kế hoạch nhận trong delivery/ | PO | có |

Bảng trên là thứ tự mặc định. Runner cho sửa trong stage, quay về stage trước qua bản ghi chuyển bước và tạo Change Set sau bàn giao. Thứ tự không thay quyền quyết định. Stage chạy theo enabled của chính nó. Vai trò tắt chỉ bỏ điểm dừng chờ người của vai trò đó. UIUX bật đòi design và tdd bật, design_system có tên. Runner kiểm điều kiện này trước stage đầu tiên và trả mã 3 khi sai. Test được viết trước code UI. Test chưa có hành vi có trạng thái planned tại tdd. UIUX chỉ tới gate sau khi test tự động thuộc phạm vi chạy đạt trên bản UI đang duyệt.

G1 xác nhận intake và phân loại. G2 chốt vấn đề, hướng và phạm vi contract. G3 chốt yêu cầu, AC và cách xác minh sau us/tdd. G4 chốt UI mẫu và chất lượng ở uiux. G5 chốt phiên bản bàn giao ở handoff. Clarify, PRD, wireframe, prototype và design có gate stage riêng theo cấu hình. G4 không áp cho US không có UI chỉ khi PO ghi lý do. Phép kiểm nội dung và truy vết vẫn chạy.

### 4.2. Làm rõ và quyết định

Tác tử viết soát năm nhóm: mâu thuẫn, câu hiểu được hai cách, ràng buộc xung đột, giả định chưa nói và edge case thiếu. Mỗi câu hỏi ghi mã, phương án, đề xuất có lý do, phần phụ thuộc và lượt hỏi. Runner giữ trạng thái open, answered, superseded, deferred và đọc câu trả lời cũ khi chạy lại. Runner không hỏi lại quyết định còn hiệu lực. Reviewer đọc nguồn, tìm câu còn thiếu và câu đã được trả lời. Người quyết định là PO. Tác tử tiếp tục phần không phụ thuộc câu hỏi.

Điểm chưa rõ của US giữ inline bằng OPEN:. Điểm làm đổi kết quả nghiệm thu ghi OPEN[blocking]: và chặn G3. Tác tử không điền một phương án chưa duyệt vào AC. Trang Open items gom câu hỏi từ US và dẫn về dòng gốc. Sổ quyết định ghi câu trả lời có ngày, email, lý do và nơi áp dụng. Quyết định mới hơn thắng quyết định cũ cùng vấn đề. Dòng cũ giữ lịch sử và ghi nơi thay thế.

### 4.3. Luồng trong một stage

1. Runner kiểm cấu hình và file ngữ cảnh, ghép prompt với file được khai báo. Tác tử viết tạo đầu ra.
2. Runner chạy mọi eval của stage. Lỗi dữ liệu gửi lại tác tử viết sửa, tối đa limits.max_fix_rounds lượt. Lỗi công cụ trả mã 4. Hết lượt sửa trả mã 2.
3. Khi review bật, runner mở phiên reviewer mới. Reviewer chấm nguồn và đầu ra. Người viết xử lý từng finding trong log. Sau mỗi sửa, eval và review chạy lại trên bản cuối.
4. Runner chỉ ghi gate đủ điều kiện khi eval đạt và rubric không còn tiêu chí bắt buộc dưới 2 hay finding Critical/Major. Minor chưa được PO chấp nhận giữ trạng thái chờ người, không đi tiếp tự động.
5. Chủ stage bật và có gate thì runner ghi PENDING, dừng mã 2. Chủ tắt hoặc gate tắt thì ghi NOT_REQUIRED sau khi các phép kiểm đạt. Runner xét stage kế tiếp.

Runner lưu riêng bộ đếm eval-fix và review theo phạm vi và dòng lịch sử finding. Khởi động lại không xóa số lượt. Khi hết lượt, PO chỉ cho tiếp tục bằng quyết định có phạm vi, số lượt thêm và hạn dùng. Review dừng khi PASS, khi không có sửa trong vòng vừa chạy, hoặc hết review.max_rounds. Khi hết lượt review hoặc vòng sửa không đổi file, review độc lập NEEDS_CHANGES chỉ còn finding Minor open và mọi applicable mandatory criterion đạt 2 ghi GATE: PENDING, liệt kê từng finding để PO chấp nhận với reason/follow-up hoặc yêu cầu sửa. Tác tử không chấp nhận Minor thay PO; các trường hợp chặn khác vẫn dừng. Dừng review không đồng nghĩa đạt. Bản sửa cuối phải được kiểm lại. Reviewer không sửa file, không dùng kết quả chấm của tác tử viết làm dẫn chứng.

### 4.4. Quyết định tại gate

| Dòng đầu chính xác | Ai ghi | Lần chạy lại |
|---|---|---|
| GATE: PENDING | runner | giữ nguyên và dừng mã 2 |
| GATE: APPROVED | chủ stage, ghi email và thời điểm | tiếp tục nếu hash, eval và điều kiện review vẫn còn đúng |
| GATE: CHANGES_REQUESTED | chủ stage, kèm yêu cầu sửa | chạy lại stage với yêu cầu đó, giữ lịch sử yêu cầu |
| GATE: NOT_REQUIRED | runner | tiếp tục nếu kiểm tra còn đúng |
| giá trị khác | không hợp lệ | dừng trước khi chạy stage, mã 3 |

Sau dòng đầu, gate chứa khối gate-data JSON, ghi stage, SHA-256 của context và output, hash cấu hình stage, lệnh eval và mã thoát, rubric, VERDICT hoặc review disabled, finding chưa sửa, phiên bản workflow/template/ruleset, người duyệt và thời điểm khi APPROVED. JSON và cách băm được quy định trong Format v2. Vai trò tắt không bỏ lint, không bỏ yêu cầu bằng chứng và không được làm Critical/Major thành lỗi đã chấp nhận.

Khi review.enabled là false, gate ghi rõ không qua review. AI không tự ghi APPROVED. Chế độ này không chứng minh ngữ nghĩa hay nghiệm thu G3/G4/G5. Người duyệt phải cung cấp lượt review độc lập và điều kiện bắt buộc trước khi đóng các gate đó.

### 4.5. Khi đầu vào hoặc kết quả đổi

Runner băm byte của các file ngữ cảnh và output, gồm danh sách đường dẫn đã sắp xếp để phát hiện file thêm/xóa. Runner băm output dùng lại làm input sau lần ghi cuối, tránh ledger vừa viết tự làm gate cũ ngay. Runner không băm chính file gate.

Khi hash đổi, runner tìm đầu ra phụ thuộc bằng đồ thị có kiểu và phiên bản. Runner ghi ảnh hưởng trực tiếp, gián tiếp và chưa rõ, đánh bằng chứng liên quan STALE và đưa gate liên quan về PENDING. Phạm vi độc lập chỉ giữ duyệt khi có đủ quan hệ, hash còn đúng và reviewer đã xác minh tính độc lập. Khi thiếu quan hệ, runner dùng cách bảo thủ của baseline: mở lại stage sớm nhất bị ảnh hưởng và mọi stage sau nó. Khi chưa biết stage đầu, runner tính lại từ intake. PENDING không đổi vẫn chờ người. Cấu hình mới áp cho stage chưa tới gate. Đổi vai trò không xóa điểm dừng PENDING đang có. Đổi context/eval/rubric/template làm kiểm cũ mất hiệu lực ở stage dùng nó.

### 4.5.1. Vòng thay đổi và duyệt theo lô

Người mở bước quay lại ghi nguồn finding/quyết định, email hoặc vai trò, phạm vi và phiên bản trước/sau, lý do, ảnh hưởng, người có quyền và gate cần chạy lại. Reviewer đề xuất thay đổi. PO quyết định luật sản phẩm và phạm vi. Runner kiểm việc sửa đã tới AC, scenario, mục tiêu ui-contract và bằng chứng. Mã amendment đúng chưa chứng minh hành vi mới đã được kiểm.

Gate giữ riêng kết quả eval, VERDICT, quyết định người, độ mới bằng chứng, tiến độ artifact và trạng thái bàn giao. APPROVED cũ thuộc phiên bản cũ. NOT_REQUIRED chỉ bỏ điểm dừng của vai trò tắt. Mỗi bản ghi bằng chứng nêu lệnh, cwd, mã thoát thật, số chọn/tổng, lý do bỏ qua, phiên bản công cụ và ca đỏ kiểm công cụ. Thiếu công cụ hay ảnh cũ không thành PASS.

PO duyệt lại theo lô mặc định qua một bộ duyệt HTML reader sinh từ dữ liệu đã pin. Bộ duyệt liệt kê US/AC, luật trước/sau, ảnh hưởng, màn hình/state, nguồn, bằng chứng, câu hỏi và gate còn mở. PO được chọn riêng từng US/AC và xuất file quyết định JSON. Runner kiểm phạm vi, hash, người có quyền và bằng chứng trước khi ghi duyệt. File HTML không tự tạo quyền duyệt. [Payload và CLI](format/packet-interchange.md#4-cli-entrypoints-and-import) quy định packet.mjs và --import-decision/--packet-data; --result chỉ nhận kết quả manual. Bộ duyệt mang tên PRODUCT:OS Spec Driven, giữ cam kết nguồn và tách quyết định, giả định, câu hỏi mở; control dùng được bằng keyboard và được kiểm ở chiều rộng lớn/nhỏ.

PO chỉ cho dựng prototype trước contract bằng ngoại lệ đã ghi trước khi làm. Ngoại lệ có phạm vi, nguồn, lý do, hạn dùng, gate hoãn và kiểm bù. Nó không bỏ ngưỡng chất lượng bắt buộc. Runner giữ nhật ký nối thêm cho thay đổi, chuyển bước, finding, quyết định và kết quả cũ. Sửa lịch sử bằng bản ghi thay thế, không xóa dòng trước.

### 4.6. Mã thoát của runner

| Mã | Kết quả và hành động |
|---|---|
| 0 | mọi stage bật đã hoàn thành, gate còn đúng |
| 2 | chờ gate, câu trả lời, xử lý finding hoặc hết lượt sửa. In đường dẫn cần xử lý |
| 3 | cấu hình, context hay gate sai. In khóa/file cần sửa |
| 4 | công cụ hay tác tử không chạy được. In lệnh thất bại |

Lint dùng mã riêng: 0 khi có tài liệu và không lỗi, 1 khi tài liệu sai, 2 khi không đọc/không kiểm được. Runner phân biệt tài liệu sai với môi trường hỏng, không gọi một lệnh thất bại là PASS.

## 5. Vai trò và cấu hình

config/pipeline.yaml giữ hình dạng baseline và thêm stage v2. Giá trị bật tắt chỉ true/false. Owner chỉ po/qc/dev. Mỗi stage có một chủ, context là danh sách đường dẫn project-relative, eval nằm trong evals.<stage>. Người viết chỉ nhận file trong context và prompt. Context directory/glob mở thành danh sách sắp xếp, không có kết quả thì lỗi. File chưa có chỉ bỏ qua khi đúng output của một stage đang tắt, và ghi rõ đã bỏ qua. File khác thiếu trả mã 3 khi stage bắt đầu.

```yaml
version: 2
project:
  name: product
  doc_language: vi
  spec_root: spec
  us_prefix: ""             # nhãn namespace cũ, không đổi pattern US của Format v2
roles:
  po: {enabled: true, gate: true}
  qc: {enabled: false, gate: true}
  dev: {enabled: false, gate: true}
stages:
  intake:
    enabled: true
    owner: po
    context: [input/po-spec.md, rules/writing-rules.md, templates/intake.md]
  clarify:
    enabled: true
    owner: po
    context: [input/po-spec.md, spec/decisions/decisions.md, spec/glossary.md, rules/writing-rules.md, templates/decisions.md]
  contract:
    enabled: true
    owner: po
    context: [spec/intake/, spec/decisions/decisions.md, spec/glossary.md, rules/writing-rules.md, templates/contract.md]
  prd:
    enabled: true
    owner: po
    context: [spec/contract/, spec/decisions/decisions.md, spec/glossary.md, rules/writing-rules.md, templates/prd.md]
  us:
    enabled: true
    owner: po
    context: [spec/prd/, spec/decisions/decisions.md, spec/glossary.md, rules/writing-rules.md, templates/us.md, templates/us-index.md, templates/release.md, templates/epic.md]
  wireframe:
    enabled: true
    owner: po
    skill: {capability: design, skills: [es-designer]}
    context: [spec/us/, spec/prd/, spec/decisions/decisions.md, spec/glossary.md, rules/writing-rules.md, templates/wireframe.md]
  prototype:
    enabled: true
    owner: po
    skill: {capability: design, skills: [es-designer]}
    context: [spec/wireframe/, spec/us/, spec/glossary.md, rules/writing-rules.md, templates/prototype.md]
  design:
    enabled: false
    owner: dev
    context: [spec/prd/, spec/us/, spec/decisions/decisions.md, context/tech.md, spec/glossary.md, rules/writing-rules.md, templates/ux.md, templates/ui-contract.md]
    skill: {capability: design, skills: [es-designer]}
  tdd:
    enabled: true
    owner: qc
    context: [spec/wireframe/, spec/prototype/, spec/us/, spec/ux/design.md, spec/ux/ui-contract.md, spec/decisions/decisions.md, spec/glossary.md, rules/writing-rules.md, templates/scenario-case.md]
  uiux:
    enabled: false
    owner: po
    context: [spec/ux/design.md, spec/ux/ui-contract.md, spec/us/, spec/tests/, context/tech.md, spec/glossary.md, rules/writing-rules.md]
    skill: {capability: uiux, skills: [es-designer]}
    design_system: ""
  handoff:
    enabled: true
    owner: po
    context: [spec/contract/, spec/prd/, spec/us/, spec/wireframe/, spec/prototype/, spec/readable/, spec/reviews/, review/gates/, templates/handoff.md]
agents:
  writer: {command: manual}
  reviewer: {command: manual}
review:
  enabled: true
  max_rounds: 3
  rubric: rules/review-rubric.md
  log_dir: review/log
limits: {max_fix_rounds: 3}
evals:
  intake: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage intake"}]
  clarify: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage clarify"}]
  contract: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage contract"}]
  prd: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage prd"}]
  us: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage us"}]
  wireframe: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage wireframe"}]
  prototype: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage prototype"}]
  design: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage design"}]
  tdd: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage tdd"}]
  uiux: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage uiux"}]
  handoff: [{run: "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage handoff"}]
versions: {workflow: "2", templates: "2", ruleset: "2", skill: none}
gates:
  dir: review/gates
  values: [PENDING, APPROVED, CHANGES_REQUESTED, NOT_REQUIRED]
  definitions_dir: review/definitions
  stage_definitions:
    intake: {id: g1-intake, version: "1"}
    clarify: {id: clarify, version: "1"}
    contract: {id: g2-contract, version: "1"}
    prd: {id: prd, version: "1"}
    us: {id: g3-us, version: "1"}
    wireframe: {id: wireframe, version: "1"}
    prototype: {id: prototype, version: "1"}
    design: {id: design, version: "1"}
    tdd: {id: g3-tdd, version: "1"}
    uiux: {id: g4-uiux, version: "1"}
    handoff: {id: g5-handoff, version: "1"}
  scoped_definitions: []
  graph: review/dependency-graph.json
  receipts_dir: review/receipts
  candidates_dir: review/candidates
  decisions_dir: review/decisions
  exceptions_dir: review/exceptions
  changes_dir: review/changes
exit_codes: {done: 0, waiting_for_human: 2, bad_config_or_artifact: 3, environment_error: 4}
```

Prototype mặc định grey lo-fi; DS chỉ vào khi PO thêm path token có thật vào stages.prototype.context. Hai stage UI/UX mới không đòi design_adapter.

Đây là hình dạng dữ liệu, không phải file cấu hình đã giao. Khi bật design/UIUX, project thêm design_adapter trỏ profile DS local. Prompt và context cùng liệt kê authority/ruling, screen inventory/source map, token/catalog, UX writing/glossary, nguồn AC, core/adapter rubric và bằng chứng. UIUX thêm final build và kết quả TDD. Bản xuất profile trong spec giữ hash cùng nguồn project. Config dùng các khóa registry và version ở trên; [hợp đồng runner/reader](format/packet-interchange.md) quy định đường dẫn theo project root, lookup id/version, manifest thành viên/hash, payload JSON và lệnh tạo/import bộ duyệt. Manifest xuất trong spec dùng đường dẫn theo spec root; runner kiểm hash bản xuất cùng nguồn project. Khi không dùng adapter, core không đòi CLI Figma hay DESIGN:OS. Project thêm eval Node để typecheck, lint, chạy test và kiểm DS trước khi bật uiux. G4 đòi kết quả test thật, không chỉ lint tài liệu. Khi design/UIUX bật, lint đòi ui-contract từ output design trở đi. Checkpoint intake chưa có selector vẫn render được. Manifest required đã ghi thì luôn đòi contract. Prompt từng stage liệt kê context đúng như config. Giá trị us_prefix chỉ giữ metadata khi import baseline, không sinh mã US-SD0201. Mã mới dùng US-n, US-Pn hoặc NF-n để giữ hệ truy vết v1.

Eval hỗ trợ {run: command, per_file?: glob}. Runner nối đường dẫn match vào lệnh từng file. Không match là lỗi cấu hình, không được báo checked 0 là đạt. Context/eval glob phải ở project root. Config gates.values và exit_codes là giá trị cố định, project không đổi ngưỡng bằng cách đổi số. Review max_rounds ≥1, max_fix_rounds ≥0. Command không rỗng. Review rubric/log_dir, gates.dir và project.spec_root phải là đường dẫn local.

```spec-grammar
[{"doc_type":"pipeline","location":{"kind":"json","path":"stages.*.optional_context[*]"}},{"doc_type":"pipeline","location":{"kind":"json","path":"stages.*.context[*]"}},{"doc_type":"pipeline","location":{"kind":"json","path":"review.rubric"}},{"doc_type":"pipeline","location":{"kind":"json","path":"review.log_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"evals.*[].per_file"}},{"doc_type":"pipeline","location":{"kind":"json","path":"stages.*.skill.skills[*]"}}]
```

## 6. Tác tử và cách chạy

| Người chạy có | Cách làm | Bằng chứng độc lập |
|---|---|---|
| hai model CLI | khai báo hai lệnh, mỗi lệnh đọc prompt stdin | reviewer ở tiến trình mới, chỉ đọc |
| một model CLI | hai vai dùng cùng lệnh | tiến trình reviewer mới, không mang chat của tác tử viết |
| một model qua chat | command manual, runner in prompt | người chạy mở chat mới để review, lưu kết quả trong file |

Runner CLI dùng --project <root>, --config <path> tùy chọn. Lệnh tác tử nhận prompt qua stdin, kết quả stdout. Lệnh hỏng trả mã 4 và giữ stderr trong log sau khi loại secrets. Runner không chọn model mặc định của máy thay người chạy. Reviewer chỉ đọc rubric, nguồn được khai báo, template/rules/glossary và đầu ra. Reviewer không nhận lời tự chấm hay lịch sử chat của người viết.

Manual in prompt và chỉ dẫn lưu câu trả lời vào file. Runner dừng mã 2, lần chạy lại nhận --result <file>. File được kiểm là không rỗng và thuộc bước đang chờ. Runner lưu checkpoint local review/manual/<stage>.json: phase writer/reviewer, round, hash prompt và input, đường dẫn kết quả. Input đổi thì checkpoint hết hiệu lực. Người chạy xác nhận đã dùng chat mới khi đưa kết quả reviewer. Không làm được thì gate ghi review không độc lập và chưa đóng nghiệm thu. Cách này không đòi dán dữ liệu qua stdin đang bị chờ vô hạn.

## 7. Template và chất lượng tài liệu

### 7.1. PRD

PRD giữ bảng REQ và các phần về vấn đề, kết quả, phạm vi, luật, flow, dependency, kế hoạch, giả định và bàn giao. Bảng ID, Requirement, Source có ít nhất một REQ. US column là tùy chọn, có thì phải khớp trace.req. Không áp khung sáu mục hoặc bảng thông tin baseline lên bản v1 đang dùng.

### 7.2. US

Mỗi US một file, front matter có epic, trace.req, scenarios. Thân gồm sáu mục User Story, Flow, Data and rules, AC, Edge cases, UI. AC có Given/When/Then và nguồn kiểm. US/REQ/AC giữ mã đã cấp và các khoảng trống giữa số. Template I–V và mã theo prefix/Epic của baseline được thay bằng dạng v1 để không phá truy vết.

### 7.3. Thiết kế và ui-contract

Design ghi ý định, flow, dữ liệu và danh sách màn hình/state với route, vai trò, phạm vi, US/AC/SCN, board, component/pattern và nguồn. Người viết xét normal, empty, loading, error, disabled, focus, long-content, quyền và overlay. Phần không có UI nêu lý do và người xác nhận. Phần chưa rõ giữ OPEN.

Core dùng adapter DS được khai báo trong cấu hình. Adapter trỏ thứ tự đọc authority/ruling, nguồn token, nơi sinh mirror, catalog, rubric và capability. Project design system dùng nguồn token do code sở hữu. DESIGN:OS và Figma là adapter. Người viết không lấy mirror cũ làm authority hoặc sửa mirror thay nguồn.

Mỗi màn hình/state khai báo nguồn figma, html-board hoặc not-created. Figma chỉ dùng mã nguồn tượng trưng trong spec. Locator và số lượng canvas nằm ở sidecar sinh có provenance. HTML board cùng nguồn not-created là hợp lệ khi chưa có nguồn ngoài. Screen/state, board, component, SCN và locator giữ namespace riêng.

Bảng ui-contract thêm state, roles, scope, component/pattern và mục tiêu hành vi. Selector dùng accessible role + exact name hoặc test id. Nó duy nhất trong màn hình/state/quyền/phạm vi. TDD dùng bảng trước code. Người viết không đoán selector từ tên layer Figma hay HTML wireframe. Migration chưa có selector giữ cảnh báo có nguồn, không tạo dữ liệu giả.

### 7.4. Quy tắc viết

Quy tắc áp cho lớp readable và chữ giải thích của các role view. Lớp build tham chiếu luật bằng id tại nguồn chuẩn. Metadata để truy vết vẫn giữ mã. Kit SPEC dùng câu có tác nhân, hành động, kết quả và định nghĩa thuật ngữ ở đây.

- Chỉ viết hành vi đã có nguồn. US giữ câu hỏi bằng OPEN, không viết suy đoán thành kết quả đã duyệt.
- Mỗi câu nói ai làm gì và người dùng thấy gì. Một khái niệm có một tên đã định nghĩa hoặc có trong glossary.
- Không dùng ghi chú cho người viết hay cách dẫn “theo BR-03” trong prose readable. AC mô tả hành vi, không chép lại luật.
- GIVEN nêu dữ liệu/trạng thái, WHEN nêu một hành động, THEN nêu kết quả quan sát được. Bỏ từ quảng cáo và cụm trong ban-list, dùng replacement đã có nguồn.
- Câu phủ định tách bằng dấu chấm. Câu có nhiều lựa chọn tách theo điều kiện. Sơ đồ flowchart LR lấy chữ từ bảng, quyết định là câu hỏi, cạnh là câu trả lời loại trừ nhau; khoảng 4–10 ô, nhãn khoảng 45 ký tự, không dấu chấm phẩy.

Lint kiểm ban-list bằng cụm từ có ranh giới Unicode và nguồn, không đoán thuật ngữ từ chữ Latin viết hoa. Reviewer kiểm thuật ngữ chưa neo, nghĩa câu, rule và flow. Project mới giữ ban-list baseline trong rules/glossary mặc định. Migration không tự thêm ban-list chưa có ở nguồn.

### 7.5. Rubric, VERDICT và finding

Mỗi tiêu chí bắt buộc có điểm 0 thiếu/sai, 1 cần làm rõ, 2 đạt với dẫn chứng. Mọi tiêu chí bắt buộc áp dụng phải đạt 2. Tiêu chí dùng applicability applicable (mặc định khi bản ghi cũ bỏ khóa) cùng điểm 0/1/2, hoặc na cùng score null, lý do và người có quyền xác nhận. NA vẫn hiện trong bảng, không vào số mục đạt. Không dùng điểm trung bình. Các nhóm nền: A bám nguồn, B rõ nghĩa, C kiểm được, D nhất quán, E văn phong. PRD thêm phạm vi/dependency; US thêm flow/edge case; UI thêm states/DS/task/copy; bundle thêm version/approval/evidence. Mỗi mục thêm là tiêu chí bắt buộc của đối tượng đang xét.

| Severity | Điều kiện | Tác động |
|---|---|---|
| Critical | làm xây sai yêu cầu, mất kiểm soát phạm vi/quyền, không bàn giao được | chặn gate |
| Major | thiếu luật, AC, state, evidence cần cho nghiệm thu | chặn gate |
| Minor | trình bày/nhất quán nhỏ, không đổi nghĩa hoặc hành vi | PO được chấp nhận với lý do và follow-up |

Reviewer tính điểm chỉ trên tiêu chí applicable: VERDICT: FAIL khi có điểm 0, VERDICT: NEEDS_CHANGES khi không 0 nhưng có 1 hoặc finding còn open/accepted-minor, VERDICT: PASS khi có ít nhất một tiêu chí applicable, mọi điểm là 2 và không finding còn lại. Finding fixed/rejected giữ trong log nhưng không thuộc finding còn lại. Khi không có tiêu chí applicable, VERDICT: NOT_RUN; NA không tạo PASS rỗng. Review bật ghi nguyên verdict PASS|NEEDS_CHANGES|FAIL|BLOCKED|NOT_RUN vào gate-data.review.verdict; NOT_RUN không đủ điều kiện đi tiếp hay được tính đạt. Review tắt giữ enabled false, independent false, verdict null và criteria/findings rỗng. Mapping PASS/WEAK/FAIL của baseline tương ứng 2/1/0 chỉ dùng để điền dòng này. Điều kiện đi tiếp vẫn là mọi mục bắt buộc đạt 2, không Critical/Major và mọi Minor đã sửa hoặc PO chấp nhận có lý do. Một NEEDS_CHANGES với Minor được chấp nhận có thể đủ điều kiện đi tiếp. NEEDS_CHANGES với tiêu chí 1 hay Major không đủ.

Review ghi bảng Criterion, Applicability, Score, Evidence, Reason, Confirmer và bảng finding có file:line, tiêu chí, severity, tác động, đề xuất, owner email, status. Log review/log/<stage>.md giữ từng vòng và disposition: fixed kèm nơi sửa, rejected kèm dẫn chứng quyết định, accepted-minor kèm email PO/lý do/follow-up. Không tự giảm severity để qua gate. Câu hỏi PO được ghi ở source/ledger. Sau sửa, reviewer chấm lại bản cuối. Tool lỗi, timeout, thiếu input hoặc nguồn hỏng là BLOCKED, không phải PASS.

### 7.6. Glossary, quyết định, ngữ cảnh và danh sách template

Glossary có thuật ngữ, anchor, định nghĩa, nguồn; ban-list có replacement và lý do. Manifest trỏ glossary và có thể thêm CONTEXT.md với _Avoid_. context/tech.md có design system và version, React version, test tool và quy ước đặt tên. Design/UIUX luôn đọc file này và rules/glossary.

Template tài liệu xuất vào spec bundle: overview, note, intake, contract, prd, us-index, us, release, epic, readable-review, ux, wireframe-index, screen-inventory, ui-contract, change-set, build, review, decisions, glossary. Mỗi template nằm templates/<type>.md, có ví dụ điền được để lint kiểm. Template bổ trợ: scenario-case.md, scope-table.md, decision-log-row.md, gate.md, review-log.md, handoff.md, tech-context.md. Gate và log thuộc workspace quy trình, không bị ép thành trang reader. Scenario-case là materialization của SCN/AC, không thành nguồn AC mới.

## 8. Eval

### 8.1. Phép kiểm tất định

node tools/lint/lint.mjs <spec> kiểm manifest, front matter, khung, id, trace, link, ảnh, readable, scenario, ui-contract, glossary và OPEN. Lỗi in file:line, code cố định và cách sửa. Không đọc input/schema, chọn 0 file hoặc rule ném lỗi thì dừng khác 0. node tools/lint/lint.mjs --self-test dựng ca sai cho từng rule và phải bắt được từng ca. Những phép kiểm Python/Bash của baseline được viết lại trong Node, không mang nguyên script fail-open vào kit.

Render luôn lint trước. Reader verify kiểm local links, Mermaid, overflow và ảnh trên bản đã render. Mỗi checkpoint contract/amendment/PRD/US/readable/review/handoff có lint, render, verify và ảnh trang thay đổi của đúng revision. Lint xanh chỉ chứng minh cấu trúc và tham chiếu. Ảnh không thay test tương tác hay quyết định PO.

### 8.2. Review theo rubric

Reviewer độc lập đọc nguồn và AC gốc sau phép kiểm tất định. Reviewer ghi phần chưa kiểm được trước kết luận. Reviewer không sửa artifact mình chấm. Content eval khác test UI và khác TDD. Evidence ghi revision/commit, build, environment, time, workflow/template/ruleset, scenario/test version, evaluator/prompt version khi model chấm, logs/images và kết quả. Chỉ CURRENT evidence được dùng để chốt gate.

### 8.3. Bộ eval chất lượng

Mỗi evals/cases/<name>/ có po-spec.md và expected.md. Expected ghi điều phải có và điều bị cấm, gồm ca đúng, thiếu và mâu thuẫn. Bộ kit có ít nhất hai ca, một ca lấy thông tin spec baseline. Runner eval chạy pipeline trong thư mục riêng, lint và đối chiếu expected, reviewer chấm khi có model được khai báo. Thiếu model là NOT RUN/BLOCKED cho phần review, không ghi điểm giả.

node tools/evals/run-evals.mjs lưu evals/results/<timestamp>.json với revision/config/model, từng case, command/exit, expected diff, rubric, số đạt và finding mới/mất so lần trước. Chạy lại khi đổi template, format, rules, prompt, model hay evaluator. Giữ kết quả cũ để thấy lỗi bỏ sót và báo sai. Ca tự kiểm phải có negative control, không chỉ đầu vào đúng.

## 9. Scenario và TDD

Mỗi AC có ít nhất một SCN. SCN trong US front matter có id, ac array, method, status và test iff auto. Sáu cách kiểm: auto, visual, review, manual, not-built, unassigned. Status: planned, passing, failing, blocked, stale. Tác tử không gán auto hay passing từ việc thấy tên test ở nguồn cũ. Migration giữ method unassigned cho tới khi được giao cách kiểm.

QC viết test từ AC và data/flow của US, không đọc code UI để đặt kết quả mong đợi. Ca kiểm materialize trong spec/tests/cases/<US>.md. Test auto ở manifest tests_root; ghi đúng SCN id và test-name, trỏ path#name. TDD chứng minh lần đỏ đầu do thiếu hành vi, không do môi trường hỏng. QC tắt vẫn viết và chạy test theo stage enabled, chỉ không dừng chờ QC.

Chỉ SCN auto cần test tự động. SCN visual/review/manual cần cách kiểm và evidence tương ứng. Một AC có nhiều SCN chỉ được tính đạt khi mọi ca bắt buộc đạt trên bản đang xét. planned, blocked, failing, stale, not-built, unassigned không thành coverage xanh. Lỗi test là finding. Đổi expected phải quay về quyết định AC/REQ, không sửa test để hợp với UI hiện có.

## 10. UIUX và các trang theo vai trò

Project chọn design system trong stages.uiux.design_system và profile design_adapter. UI mẫu React/TypeScript strict nằm ui/. Code dùng component/token được khai báo. Người duyệt đọc AC gốc, nguồn DS/ruling, final build và evidence ở phiên độc lập, chỉ đọc. Core rubric kiểm task, state/quyền, tìm thấy thao tác, kết quả hành động, DS, responsive, accessibility, copy và độ mới bằng chứng. Adapter thêm tiêu chí. Mọi tiêu chí bắt buộc áp dụng phải đạt 2. Critical/Major chặn và Minor giữ lại cần lý do PO cùng follow-up.

Mỗi cell màn hình/state/role/scope/mode trong ma trận cần ảnh bản cuối, đo cấu trúc, kiểm tương tác, keyboard/focus/label và review nhìn thật. Cell được định danh bằng screen/state/role/scope/SCN/width/height/mode/locale/fixture; không dùng ảnh admin cho viewer. Bản ghi đã capture nêu build, browser, DS/probe, đường dẫn PNG/measurement và thời điểm. Cell chưa chạy giữ requested context, exit null, selected 0, freshness MISSING, log/hash thật và recovery; output capture vắng hoặc null, không bịa đường dẫn. NA/SKIPPED không vào số đạt. [Design model](format/design-model.md#5-images-visual-evidence-and-capability-limits) quy định phép join chính xác. Floor là 375/768/1440, project design-system adapter có thể thêm 874×827. Brief thêm breakpoint ±1. Thiếu browser/font/plugin/DS map được ghi NOT RUN/BLOCKED cùng hành động xử lý. Ảnh wireframe, ảnh cũ và review tư vấn không đóng G4.

Glossary và UX writing có locale, source key, thuật ngữ giữ nguyên và ngoại lệ có lý do. Người viết giữ dấu tiếng Việt/NFC, placeholder, đơn vị và dữ liệu nghiệp vụ nguyên văn. Project chỉ EN không cần dựng bản VI. [Ngữ pháp glossary](format/glossary-grammar.md) quy định header, JSON cell, escaping, locale mặc định và kiểm nguồn. Reviewer kiểm nghĩa trên bản render.

Reader sinh PO/Dev/QA từ cùng lớp build. PO thấy design preview, nguồn, trạng thái duyệt, OPEN và bộ duyệt HTML. Dev thấy flow/state/quyền/DS/ui-contract/departure. QA thấy AC → SCN → screen/state → method/test → evidence và CURRENT/STALE/MISSING. Các trang nối màn hình, board, component và evidence. Nguồn thiếu, retired, unverified được nêu đúng. Reader theme khác DS sản phẩm.

Reader chạy offline. Kiểm từng view và bộ duyệt tại 375, 768, 1440 và 874×827, cả light/dark, keyboard/focus/labels và control có tác dụng. Kiểm nội dung dài, không ảnh, nguồn thiếu/retired và ảnh denied. Reviewer độc lập kiểm craft bản render. Legacy thiếu contract vẫn hiện cảnh báo. G4 cho UI mới đòi contract và bằng chứng thật.

## 11. Tạo project mới

Chạy lệnh từ kit để tạo project trong một thư mục trống; không cần sửa file giữa init và lần chạy manual đầu tiên:

```sh
node tools/run/init.mjs --project /path/to/new-project --name "Tên project" --lang vi
node tools/run/doctor.mjs --project /path/to/new-project
node tools/run/run.mjs --project /path/to/new-project --head fresh-source --build not-built
```

Init chép nội dung từ danh sách chuẩn `tools/lib/kit-content-paths.mjs`, bỏ `evals/results/`, tạo nguồn PO mẫu, context kỹ thuật từ template, spec rỗng, định nghĩa gate theo config/prompt, đồ thị chưa chứng minh đầy đủ và baseline chưa xuất bản. Không dựng email hoặc phê duyệt. PO điền nguồn thật và `roles.po.approvers` trước khi import quyết định; thay baseline bằng snapshot bất biến thật trước G5/import. Ngoài Git cần `--head`; `--build not-built` dành cho spec trước code. Init giữ role defaults, design/UIUX tắt.

Mặc định hai tác tử là `manual`; runner in prompt intake, chỉ dẫn `--result` rồi dừng mã 2. Writer chọn `codex|claude|manual`, reviewer chọn `codex|claude|grok|manual`; `--writer codex --reviewer grok` dùng hai CLI qua wrapper. `--agent codex|claude|manual` chọn cả hai vai; `--writer grok` và `--agent grok` bị từ chối vì Grok chỉ có reviewer. `--agent "<lệnh>"` dùng một lệnh stdin/stdout do project cung cấp cho cả hai vai. Grok reviewer mặc định `grok-4.7`, chạy lean trong sandbox chỉ đọc, không tool/web/subagent/MCP; chỉ trả final text khi `stopReason` là `end_turn` và text không rỗng, còn hủy hoặc kết thúc khác đều là lỗi. Model và effort nằm ở tham số wrapper, không ở lõi runner. Doctor kiểm Node, Ajv 2020, CLI được cấu hình và nêu phần Playwright/Chromium chưa sẵn sàng.

Definition scope revision chỉ ghim kind, ids đã sắp xếp và definition id/version; bytes mới không cần binding mới. Thay membership dừng `scope-version-required` và cần phiên bản mới. Candidate/receipt vẫn ghim content hashes; sửa sau approval làm gate STALE/PENDING. Lint stage không yêu cầu records mà stage hiện tại hoặc stage sau chưa sinh; records đã có vẫn được kiểm tra, export/handoff giữ các joins bắt buộc.

Init từ chối thư mục không rỗng. `--force` chỉ chép file còn thiếu, giữ mọi file đang có, kể cả config, input, spec và review; không ghép hoặc ghi đè nội dung. Thay cờ name/lang/agent cùng `--force` không thay config hiện có. Init trên project đã có config mà `--writer`, `--reviewer` hoặc `--agent` khác `agents.<role>.command` thì thoát mã 3, không ghi file nào, và in dòng cần sửa tay trong `config/pipeline.yaml`. Symlink trong target bị từ chối.

Từ kit mới, chạy `node tools/run/init.mjs --project /path/to/existing-project --upgrade --dry-run` để xem toàn bộ kế hoạch, rồi bỏ `--dry-run` để áp dụng. Upgrade thay bytes kit, chỉ xóa file kit cũ còn nguyên theo inventory lock nhất quán, giữ file cũ đã sửa hoặc không rõ nguồn và mọi nguồn PO/bản ghi run; alias đường dẫn theo NFC + lowercase được giữ và báo, không ghi đè. Định nghĩa gate đổi được ghi thành phiên bản số mới cạnh bản cũ, config chọn phiên bản mới nhưng approval không được sửa hoặc ký lại. Name, language, writer/reviewer và lựa chọn `--agent` lúc init luôn thuộc project, kể cả bằng default cũ; kế hoạch ghi rõ giá trị giữ và default mới. Các key khác ghép ba chiều: nhận default mới cho key chưa sửa, xung đột cùng key dừng mã 3 không ghi; project legacy không có lock giữ các key đang có vì default cũ chưa biết. Init mới và upgrade ghi `kit.lock.json` gồm commit kit nếu có, version, inventory SHA-256 file đã cài/file kit cung cấp, checksum, default config và lựa chọn init; doctor chỉ báo current khi mọi file kit hiện tại có đủ hash đúng và có trong lock nhất quán, còn lại drift hoặc unknown, không gọi model. Với `config/pipeline.yaml`, lock mới ghi thêm `configDigest` là hash phần kit sở hữu (bỏ `project.name`, `project.doc_language`, `agents.*`, `roles.*`, `stages.*.enabled`), nên sửa owner key không gây drift; lock cũ không có field này vẫn so toàn bộ bytes đến khi upgrade ghi lại lock. Upgrade dùng lock độc quyền ghi PID/thời điểm process bắt đầu trước khi lập kế hoạch; lock đã tồn tại bị từ chối mã 3, báo PID/thời điểm bắt đầu và process có vẻ còn chạy hay đã thoát, không thay đổi lock; xác nhận process đã thoát rồi xóa `<project>/.kit-upgrade.lock` và chạy lại. Kit cũ hơn version/commit đã ghi bị từ chối mã 3, không có override downgrade. Upgrade stage bytes rồi rename, lỗi được rollback; chạy lại cùng kit là `already current`, tree không đổi sau khi bỏ lock tạm. Chi tiết và giới hạn transaction ở `tools/run/README.md`.

Fallback khi chép tay:
1. Chép SPEC.md, format/, templates/, rules/, prompts/, tools/, config/pipeline.yaml và evals/cases/ cùng version; không chép reference/, proof, nguồn sản phẩm, logs hoặc eval results.
2. Tạo input/, context/, review/, spec/; điền `input/po-spec.md`, `context/tech.md` và config từ nguồn đã xác nhận. Chuẩn bị exact-version definitions, graph và baseline trước khi chạy; dùng init trên thư mục trống tránh thiếu registry.
3. Chạy doctor rồi runner theo lệnh ở trên. Project mới không sửa công cụ hoặc template lõi để hợp nội dung riêng.

Kit SPEC được chép vì nó quy định cách chạy. Project contract riêng quy định luật sản phẩm, không sửa ngược kit SPEC để ghi một quyết định nghiệp vụ.

## 12. Cấu trúc thư mục

```text
<project>/
├── SPEC.md
├── format/                 Format v2, gate/design models, schemas, maps
├── templates/              khung tài liệu và file quy trình
├── rules/                  writing rules, rubric, glossary mặc định
├── prompts/                intake..handoff, reviewer
├── config/pipeline.yaml
├── input/po-spec.md
├── context/tech.md
├── tools/                  lint, run, reader, migrate, evals (Node)
├── spec/
│   ├── spec.manifest.json
│   ├── glossary.md
│   ├── intake/, contract/, prd/, us/
│   ├── readable/epic-map.json và các trang dẫn xuất
│   ├── ux/                 design, ui-contract, boards
│   ├── decisions/, reviews/, delivery/, assets/, changes/
│   └── tests/              cases và test auto theo tests_root
├── ui/                     React + TypeScript strict
├── review/                 gates/, log/, manual/, transitions/, exceptions/, audit.jsonl
└── evals/                  cases/, results/
```

spec.manifest là manifest reader, có thể đổi folder qua artifacts. Manifest bàn giao là snapshot version/checksum/scope/gates/evidence riêng trong delivery/. Manifest bàn giao bất biến, trạng thái Published/Acknowledged nằm record khác.

## 13. Tiêu chí hoàn thành của kit

- Format v2 đầy đủ, schema kiểm được; source map không bỏ ngầm phần nguồn. Mọi loại tài liệu có template và ví dụ lint đạt. Config/prompt dùng cùng context.
- Lint fail-closed, self-test bắt ca sai từng rule; runner giữ stage/role/gate/hash/manual/exit contracts. Config mặc định chỉ PO dừng chờ, QC/Dev tắt, design/UIUX tắt. PENDING không bị tự bỏ qua.
- Migration giữ input nguyên, kết quả deterministic, số US/AC/REQ/decision giữ hoặc giải thích từng chênh lệch; proof project-copy lint đạt, chỉ warning unassigned và legacy UI được cho phép theo quyết định đã ghi.
- Reader PO/Dev/QA/Open/coverage chạy offline, verify đạt, có ảnh light/dark theo viewport. Eval lưu kết quả/diff. Adapter ngoài giữ đường v1 và mở nhánh/PR riêng để owner duyệt.
- Handoff đủ contract/PRD/US/scenario/dependency, không blocker, gates đúng phiên bản, evidence CURRENT, manifest pin scope và exclusions. Approved spec/concept không thành Delivery Done hay production acceptance.

Sau G5, thay đổi dùng bản ghi Change Set và bộ duyệt HTML theo mô hình gate. Published, Acknowledged và lựa chọn chuyển baseline của từng người nhận là ba sự kiện riêng. Thay đổi đi qua Change Set từ baseline đang dùng: phân tích PRD/US/UI/test/delivery, PO chọn thời điểm/phạm vi, sửa draft, đánh STALE, chạy lại gate liên quan, tạo baseline mới và ghi Dev/QC chuyển sang bản nào. Giữ baseline cũ. Spec rollback là thay đổi được duyệt hoặc revert có kiểm, không xóa lịch sử. Kit không tự merge/publish; người điều phối làm bước đó theo quyền project.

## 14. Các điểm mở của baseline được xử lý thế nào

| Mục | Lựa chọn của kit | Lý do |
|---|---|---|
| O-03 | chép SPEC.md vào project mới | người chạy cần contract quy trình và phiên bản đi cùng tools |
| O-04 | UIUX bật nhưng DS trống: exit 3 trước stage đầu | không âm thầm bỏ công việc đã bật |
| O-05 | cách tìm phần tử ở ui-contract, cách kiểm ở scenario | mỗi thông tin có một nguồn; không thêm mục trùng trong design |
| O-06 | reviewer đọc rubric, source, template/rules/glossary và output ở phiên mới | kiểm bám nguồn cần nguồn gốc; không dùng chat riêng của người viết |
| O-07 | target release lấy phiên bản scope đã duyệt; author là email từ nguồn hoặc role. Nếu chưa biết, giữ OPEN và chặn G5 khi field cần bàn giao | bỏ ô TBD I–V, giữ người thật theo email; không đoán release hay author |
| O-08 | design context có writing rules và glossary | reviewer và writer dùng cùng quy tắc chữ/thuật ngữ |
| O-09 | clarify context có ledger hiện tại | tìm câu đã trả lời trước khi đặt câu mới |

Các lựa chọn này là mặc định thiết kế kit, không phải câu trả lời mới cho nghiệp vụ của proof case. Owner đổi mặc định qua quyết định có ngày và cập nhật contract liên quan.
