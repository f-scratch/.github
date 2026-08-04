# Cycle PR

Cycle PRは、Sprintブランチ、integrationブランチ、リリースブランチの間に必要なPull Requestを作成するGitHub Actionです。

設定ファイルには処理手順ではなく、リポジトリのブランチ構成を記述します。Cycle PRは設定と現在のGitHubを比較し、不足しているPull Requestだけを作ります。

## 動作の考え方

標準的な構成では、次のPull Requestを管理します。

- 前のSprintから次のSprintへ変更を引き継ぐ
- 前のSprintから`stg01`へ変更を送る
- 最新Sprintから最初のリリース段階と`trunk`へ変更を送る
- 設定されたリリース段階を順番につなぐ
- 最後のリリース段階から`trunk`へ変更を戻す
- `trunk`から最新integrationへ基準となる変更を送る
- 古いintegrationから次のintegrationへ変更を引き継ぐ

Cycle PRは、Pull Requestのマージ、競合解消、ブランチの作成や削除、既存Pull Requestの書き換えを行いません。最新integrationから`trunk`へ戻すPull Requestも、Sprintの完了判断を伴うため自動作成しません。

## 設定

呼び出し元リポジトリの既定ブランチに`.github/cycle-pr.yml`を置きます。

```yaml
version: 1

trunk: develop

integration:
  prefix: integration/sprint

release:
  stg: release-stg
  stg01: release-stg01
  prd: release-prd
  procedure: .github/release_procedure.md
```

`trunk`には`main`や`develop`など、各リポジトリの基準となるブランチを指定します。

`integration`を使わない場合は省略します。指定した場合、`trunk`から最新integrationへのPull Requestと、古いintegrationから次のintegrationへのPull Requestを管理します。

`release`には存在する段階だけを指定します。例えば`stg01`がない場合は次のようにします。

```yaml
version: 1
trunk: main
release:
  stg: release-stg
  prd: release-prd
```

この場合、リリース経路は`release-stg → release-prd → main`になります。リリースブランチがない場合は`release`全体を省略できます。

### Sprint番号

標準では`develop_sprint`に続く番号をSprint番号として扱います。整数と小数形式の両方に対応します。

```text
develop_sprint18
develop_sprint19
develop_sprint19.0
develop_sprint19.1
develop_sprint19.2
develop_sprint19.10
develop_sprint20
```

文字列順や小数値ではなく、バージョン番号としてこの順に並べます。`19`と`19.0`は別のSprintとして扱います。

別の接頭辞を使う場合だけ`sprint.prefix`を指定します。

```yaml
sprint:
  prefix: develop_cycle
```

integrationの番号も同じ規則で比較します。

### 追加ラベル

標準ラベルにリポジトリ固有のラベルを追加できます。

```yaml
extra_labels:
  sprint: [Sprint開発]
  promotion: [deploy]
```

`sprint`はSprint間と最新Sprintから`trunk`へのPull Request、`promotion`はリリース経路のPull Requestへ追加されます。

## 各リポジトリから呼び出す

各リポジトリには、対象ブランチと共有workflowの呼び出しだけを置きます。

```yaml
name: Cycle PR

on:
  workflow_dispatch:
    inputs:
      source_branch:
        description: 処理するブランチ（省略時は実行対象ブランチ）
        required: false
        type: string
  push:
    branches:
      - develop
      - develop_sprint*
      - integration/sprint*
      - release-*

jobs:
  cycle-pr:
    permissions:
      contents: read
      pull-requests: write
    uses: f-scratch/.github/.github/workflows/cycle-pr.yml@master
    with:
      source_branch: ${{ inputs.source_branch || github.ref_name }}
```

push対象のブランチに対応する経路が設定されていない場合は、何も作成せず正常終了します。

## Pull Requestを作らない場合

次の場合は新しいPull Requestを作りません。

- 同じ作成元と取り込み先のPull Requestが既に開いている
- 作成元から取り込み先へ引き継ぐcommitがない
- pushされたブランチに対応する経路が設定されていない

設定された取り込み先ブランチや必須ラベルが存在しない場合は、設定ミスとして失敗します。
