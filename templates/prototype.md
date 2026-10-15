Self-contained lo-fi screen skeleton. Replace this example title, fields, actions, rows and messages with the approved ASCII wireframe.
Allowed elements only: html, head, meta (charset=utf-8 or name=viewport only), title, style (exactly one), body, main, header, footer, nav, section, div, span, p, h1-h6, a, button (type=button; no form submission attributes), label, input (effectively readonly or disabled), textarea (readonly), select (disabled; only option children), option, ul, ol, li, table, thead, tbody, tr, th, td, strong, em, small, br, hr, figure, figcaption, pre, code, svg, g, path, rect, circle, ellipse, line, polyline, polygon (basic shapes only inside svg); every other element fails P-ELEMENT with its tag and line.
```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prototype</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; background: #f5f5f5; color: #222; }
main { max-width: 1040px; padding: 32px; margin: auto; }
h1 { font-size: 32px; line-height: 1.25; }
h2 { font-size: 24px; line-height: 1.25; }
h3 { font-size: 20px; line-height: 1.25; margin: 0; }
section { padding: 24px 0 40px; scroll-margin-top: 16px; }
.trace { margin: 8px 0 16px; max-width: 65ch; }
.screen { width: 100%; max-width: 720px; border: 1px solid #777; background: #fafafa; }
.screen-header { padding: 16px 24px; background: #e5e5e5; border-bottom: 1px solid #777; }
.screen-body { padding: 24px; }
.screen-body > label { display: block; font-weight: 600; margin-bottom: 8px; }
.screen-body > input { width: 100%; min-width: 0; height: 44px; border: 1px solid #777; padding: 8px 12px; font: inherit; color: #222; background: #fafafa; }
.screen-body > input:disabled { opacity: 1; background: #e5e5e5; color: #555; }
.actions, .state-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
a { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 16px; color: #222; text-underline-offset: 4px; }
a.button { border: 1px solid #777; background: #e5e5e5; text-decoration: none; justify-content: center; }
a:focus-visible, input:focus-visible { outline: 2px solid #222; outline-offset: 2px; }
@media (hover: hover) { a:hover { background: #ddd; } }
a:active { background: #ddd; }
.rows { list-style: none; margin: 24px 0 0; padding: 0; }
.rows li { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #777; }
.state-message { margin: 16px 0; }
::selection { background: #ddd; color: #222; }
@media (max-width: 600px) { main { padding: 16px; } .screen-header, .screen-body { padding: 16px; } }
</style>
</head>
<body><main>
<section id="start"><h1>Prototype</h1><a class="button" href="#SCR-001--normal">US-01: bắt đầu</a></section>
<section id="SCR-001--normal"><h2>SCR-001 · normal</h2><p class="trace">US-01 · US-01.AC-01</p>
<div class="screen" role="group" aria-labelledby="SCR-001--normal-title"><header class="screen-header"><h3 id="SCR-001--normal-title">Bộ lọc đã lưu</h3></header><div class="screen-body">
<label for="filter-name">Tên bộ lọc</label><input id="filter-name" type="text" inputmode="text" autocomplete="off" value="Bộ lọc của tôi" readonly>
<p class="state-message">Tên tối đa 40 ký tự. Chọn lưu để xem kết quả.</p>
<nav class="actions" aria-label="Thao tác bộ lọc"><a class="button" href="#SCR-001--normal">Lưu bộ lọc</a></nav>
<ul class="rows" aria-label="Danh sách bộ lọc"><li><span>Open bugs</span><span>Đã lưu</span></li></ul>
</div></div><a href="#start">Về đầu</a></section>
</main></body>
</html>
```
Every non-N/A screen state uses a bordered class screen frame, title bar, labelled field boxes, anchors styled as action buttons, list/table rows and its state message in place. Keep US/AC trace outside the frame as a caption. Add every flow and state anchor; exactly one inline style, no script, external resource or form submission. Use supplied DS tokens when declared in prototype context; otherwise system font and neutral greys.
