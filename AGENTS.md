# AGENTS.md

このリポジトリで AI コーディングエージェントが作業するときの指示。

## リポジトリの役割

f-scratch org 共通の GitHub 設定を置くリポジトリ。中身は次の 3 種類。

- `.github/PULL_REQUEST_TEMPLATE.md`: org 共通の PR テンプレート。各リポジトリの PR 本文はこれに従う
- `workflow-templates/`: org の各リポジトリが「Actions → New workflow」から取り込む workflow テンプレート（`*.yml` と同名の `*.properties.json` がペア）
  - `add_bdash4_project.yml`: `develop**` / `release-*` 向け PR を org project 23 に追加する
  - `create_cycle_pr.yml`: 共有 workflow `cycle-pr.yml` を呼び出す
  - `manage_test_branches.yml`: 毎日 `test/it-YYYYMMDD` を `develop` から作り、7 日より古いものを削除する
- `actions/cycle-pr/` と `.github/workflows/cycle-pr.yml`: Sprint・integration・release ブランチ間に不足している PR を作る共有 action / reusable workflow。仕様は [actions/cycle-pr/README.md](actions/cycle-pr/README.md)

## 技術スタック

- GitHub Actions（YAML）
- `actions/cycle-pr`: Node.js 24（`action.yml` の `runs.using: node24`、CI の `node-version: 24`）、ESM（`"type": "module"`）
  - 依存: `@actions/core` / `@actions/github` / `yaml`、バンドルに `@vercel/ncc`
  - テスト: Node 組み込みの `node --test`

## ディレクトリ構成

- `actions/cycle-pr/src/`: `config.js`（`.github/cycle-pr.yml` の検証）、`planner.js`（作成すべき PR 経路の計算）、`versioned-branches.js`（Sprint/integration 番号の比較）、`index.js`（GitHub API 呼び出し）
- `actions/cycle-pr/test/`: 上記のユニットテスト
- `actions/cycle-pr/dist/`: `ncc` でビルドしたバンドル。action はこれを実行する
- `.github/workflows/test-cycle-pr.yml`: cycle-pr の CI

## 開発コマンド

`actions/cycle-pr` で実行する（CI と同じ）。

```bash
cd actions/cycle-pr
npm ci
npm test          # node --test
npm run build     # ncc build src/index.js -o dist --minify
```

## 変更時のルール

- `actions/cycle-pr/src/` を変えたら `npm run build` して `dist/` も同じ PR でコミットする。CI は build 後に `git diff --exit-code -- dist` で差分があると落ちる。
- 他リポジトリは `f-scratch/.github/.github/workflows/cycle-pr.yml@master` と `f-scratch/.github/actions/cycle-pr@master` を参照している。master へのマージは即座に org 全体の Cycle PR 動作に反映される。入力や設定キーを変えるときは呼び出し側との互換を確認し、`actions/cycle-pr/README.md` と `workflow-templates/create_cycle_pr.yml` も合わせて更新する。
- `.github/PULL_REQUEST_TEMPLATE.md` は org 全リポジトリの PR 本文に効く。HTML コメントの記載条件（必須 /「なし」表記 / セクション削除）も含めて、変更は意図したものだけにする。
- workflow テンプレートを追加するときは `<name>.yml` と `<name>.properties.json`（`name` / `description`）をセットで置く。

## ブランチと PR

- default ブランチは `master`。作業ブランチ（例: `chore/CHORE0xxx_xxx`）から `master` へ PR を出す。`master` に直接 push しない。
- コミットメッセージ・PR タイトルは `[課題ID] 概要`。本文は [PR テンプレート](.github/PULL_REQUEST_TEMPLATE.md) に従う。
- 実装ルール: https://github.com/f-scratch/dx-windsurf-rules の `rules/` 配下 `yaml_rules.md` / `comment_rules.md`

## してはいけないこと

- workflow 内のシークレット（`secrets.BUNDLE_GITHUB__COM` 等）の値を書き込む・出力する変更をしない。
- `dist/` を手で編集しない（必ず `npm run build` で再生成する）。
- `node_modules/` をコミットしない（`.gitignore` 対象）。
