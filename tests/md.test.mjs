import {test} from "node:test";
import assert from "node:assert/strict";
import {renderMarkdown,renderInline,parseBlock,continueList} from "../md.mjs";

test("raw HTML is always escaped",()=>{
  const html=renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
  assert.ok(!html.includes("<img"));assert.ok(!html.includes("<script"));
});
test("only http(s) and mailto links become links",()=>{
  assert.ok(!renderInline("[x](javascript:alert(1))").includes("<a"));
  assert.ok(!renderInline("[x](data:text/html,1)").includes("<a"));
  assert.match(renderInline("[x](https://a.ru/p)"),/<a href="https:\/\/a\.ru\/p"/);
  assert.match(renderInline("[x](mailto:a@b.ru)"),/href="mailto:a@b\.ru"/);
});
test("links may contain balanced parentheses",()=>{
  assert.match(renderInline("[w](https://en.wikipedia.org/wiki/A_(b)) дальше"),/href="https:\/\/en\.wikipedia\.org\/wiki\/A_\(b\)"[^>]*>w<\/a> дальше/);
});
test("bare addresses become links without trailing punctuation",()=>{
  const html=renderInline("см. https://example.com/a_b_c. и (https://ya.ru)");
  assert.match(html,/href="https:\/\/example\.com\/a_b_c"/);
  assert.match(html,/<\/a>\. и \(<a/);
  assert.match(html,/href="https:\/\/ya\.ru"/);
  assert.ok(!renderInline("http://нет").includes("<a"));
});
test("a stray NUL character never leaks placeholders",()=>{
  assert.ok(!renderInline("a\u00000\u0000b").includes("undefined"));
});
test("numbered lists keep their first number",()=>{
  assert.match(renderMarkdown("3. x\n4. y"),/<ol start="3">/);
  assert.match(renderMarkdown("1. x"),/<ol>/);
});
test("tags: words, not numbers or fragments",()=>{
  assert.match(renderInline("#тег"),/md-tag/);
  assert.ok(!renderInline("номер #12").includes("md-tag"));
  assert.ok(!renderInline("a.com/#part").includes("md-tag"));
});
test("formatting inside code is left alone",()=>{
  assert.equal(renderInline("`a*b*`"),"<code>a*b*</code>");
});
test("checklists render as tasks",()=>{
  const html=renderMarkdown("- [ ] a\n- [x] b");
  assert.match(html,/md-task"/);assert.match(html,/md-task is-done/);
});
test("list blocks are recognised",()=>{
  assert.equal(parseBlock("- a").kind,"bullet");
  assert.equal(parseBlock("2. a").kind,"numbered");
  assert.equal(parseBlock("текст").kind,null);
  assert.equal(typeof continueList,"function");
});
test("underscores and stars inside Cyrillic words are not emphasis",()=>{
  assert.equal(renderInline("мой_файл_тут"),"мой_файл_тут");
  assert.equal(renderInline("слово*звезда*слово"),"слово*звезда*слово");
  assert.equal(renderInline("_курсив_"),"<em>курсив</em>");
});
