import { test, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App.jsx";
test("registration defaults to one full sheet instead of per-action uploads", () => {
  const html = renderToStaticMarkup(React.createElement(App));
  expect(html).toContain('id="sheet-workflow"');
  expect(html).toContain("4×4 시트 한 장으로 데려오기");
  expect(html).not.toContain("동작 만들기 · GPT 그림을 앱에서 정리");
  expect(html.indexOf('id="sheet-workflow"')).toBeLessThan(html.indexOf("다른 방법: 이 PC에서 만들기"));
});
test("empty studio explains photo workflow and never pretends an image is generated", () => {
  const html = renderToStaticMarkup(
    React.createElement(App, {
      initial: { photos: [], artworks: [], jobs: [], hasKey: false },
    }),
  );
  expect(html).toContain("사진 추가");
  expect(html).toContain("OpenAI 연결 · 선택");
  expect(html).toContain("로컬 생성에는 필요 없어요");
  expect(html).toContain("OpenAI");
  expect(html).toContain("disabled");
  expect(html).not.toContain("생성이 완료");
});
test("imported artwork remains explicitly marked as imported", () => {
  const html = renderToStaticMarkup(
    React.createElement(App, {
      initial: {
        photos: [],
        artworks: [
          {
            id: "sample",
            name: "이전 시안",
            source: "imported",
            thumbnail: "data:image/png;base64,AA==",
          },
        ],
        jobs: [],
        hasKey: false,
      },
    }),
  );
  expect(html).toContain("가져온 그림");
  expect(html).toContain("이전 시안");
});
