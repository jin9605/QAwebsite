# QA Ticket Desk — DB 구조 안내

이 문서는 새 환경에서 QA Ticket Desk의 데이터 구조를 빠르게 이해하고 설정하기 위한 안내서입니다.

## 1. 저장 위치

| 대상 | 용도 |
| --- | --- |
| Cloudflare D1 (SQLite) | 사용자, 프로젝트, 티켓, 댓글, 이력, 기획 메타데이터 |
| Cloudflare R2 | 티켓 증빙 파일과 기획 원본 파일 |
| Git | 애플리케이션 코드, DB migration, 시드·관리 스크립트 |

첨부파일의 실제 바이너리는 D1에 저장하지 않습니다. D1의 `attachments.object_key`, `planning_documents.object_key`에 R2 파일 경로만 저장합니다.

## 2. 핵심 관계

```text
users ──< sessions
  │
  ├──< project_members >── projects ──< tickets ──< attachments
  │                                              ├──< comments
  │                                              └──< ticket_history
  │
  └──< audit_logs

projects ── 0..1 project_plans
projects ──< planning_documents
projects ──< planning_items
```

현재 D1 스키마는 외래 키 제약을 강제하지 않습니다. API에서 프로젝트 접근 권한과 데이터 연결을 검사하므로, 운영 스크립트로 행을 직접 수정할 때는 연결된 데이터를 함께 확인해야 합니다.

## 3. 주요 테이블

### 사용자·인증

| 테이블 | 주요 필드 | 설명 |
| --- | --- | --- |
| `users` | `id`, `name`, `email`, `role`, `status` | 서비스 사용자. `role`은 `admin/member/viewer`, `status`는 가입 승인 상태입니다. |
| `sessions` | `token`, `user_id`, `expires_at` | 로그인 세션입니다. DB에는 해시된 토큰을 저장합니다. |
| `login_history` | `email`, `success`, `ip_address`, `user_agent`, `reason` | 로그인 성공·실패 감사 기록입니다. |
| `audit_logs` | `actor_id`, `action`, `target_type`, `outcome` | 관리자 작업과 보안 관련 변경의 수정 불가 감사 기록입니다. |

`users.password_hash`와 `users.password_salt`에는 PBKDF2 해시 정보만 저장됩니다. 비밀번호 원문은 저장하지 않습니다.

### 프로젝트·권한

| 테이블 | 주요 필드 | 설명 |
| --- | --- | --- |
| `projects` | `id`, `name`, `ticket_name`, `start_date`, `due_at`, `status` | 게임/출시 단위 프로젝트입니다. `ticket_name`은 `MSA-0001` 같은 티켓 번호 접두사입니다. |
| `project_members` | `project_id`, `user_id`, `role` | 프로젝트 멤버 및 역할입니다. 역할은 `project_admin`, `qa`, `developer`, `viewer`입니다. |
| `project_plans` | `project_id`, `concept`, `stages_json` | 프로젝트 기획 요약과 단계 정보입니다. 프로젝트당 한 행입니다. |

프로젝트 멤버가 아닌 사용자는 해당 프로젝트의 티켓, 첨부파일, Timeline에 접근할 수 없습니다. 전역 `admin`은 모든 프로젝트를 관리할 수 있습니다.

### 티켓·증빙·협업

| 테이블 | 주요 필드 | 설명 |
| --- | --- | --- |
| `tickets` | `id`, `project_id`, `ticket_number`, `status`, `severity`, `assignee_id`, `due_at` | 핵심 BTS 티켓입니다. 삭제 시 즉시 삭제하지 않고 `deleted_at`을 채워 휴지통으로 이동합니다. |
| `attachments` | `ticket_id`, `object_key`, `content_type`, `size` | 티켓 증빙 파일의 메타데이터와 R2 경로입니다. |
| `comments` | `ticket_id`, `created_by_id`, `body` | 티켓 댓글입니다. 작성자 ID 기준으로 수정·삭제 권한을 판정합니다. |
| `ticket_history` | `ticket_id`, `actor_id`, `before_json`, `after_json` | 티켓 필드 변경 전후 값입니다. 생성·댓글 등록은 화면 이력에서 의도적으로 제외됩니다. |

티켓 상태는 `신규`, `진행`, `완료`, `이슈 아님`입니다. `이슈 아님`이면 `issue_reason`이 필요합니다. 상태·필드 변경 권한은 서버 API에서 프로젝트 역할을 기준으로 검증합니다.

### 기획 라이브러리

| 테이블 | 주요 필드 | 설명 |
| --- | --- | --- |
| `planning_documents` | `title`, `category`, `text_content`, `object_key` | 업로드한 기획 문서의 검색용 본문과 R2 원본 파일 경로입니다. |
| `planning_items` | `kind`, `code`, `title`, `tags`, `linked_*_ids` | 기능/정의/의사결정 등 기획 항목입니다. 연결 ID 배열은 JSON 문자열로 저장합니다. |

## 4. 시간·삭제 정책

- 모든 시간은 ISO 8601 문자열(`TEXT`)로 저장합니다.
- 티켓 삭제는 soft delete입니다. `deleted_at`이 있는 티켓은 일반 조회에서 제외되고 휴지통에서 복구 또는 관리자 완전 삭제가 가능합니다.
- 완전 삭제 시 연결된 R2 첨부파일과 댓글·첨부 메타데이터를 함께 삭제합니다.
- 댓글은 휴지통을 거치지 않고 즉시 삭제합니다.
- 감사 로그와 변경 이력은 운영 추적용 데이터입니다. 직접 수정·삭제 UI를 제공하지 않습니다.

## 5. 성능을 위한 인덱스

주요 조회 패턴에 맞춰 아래 인덱스를 둡니다.

- `tickets(deleted_at, updated_at, id)` — 목록 최신순
- `tickets(project_id, deleted_at, updated_at)` — 프로젝트별 목록·Board·Timeline
- `tickets(assignee_id, deleted_at, updated_at)` — 담당자 필터
- `tickets(status, due_at)` — 상태·마감일 필터
- `project_members(user_id, project_id)` — 사용자 접근 가능 프로젝트 판정
- `ticket_history(ticket_id, created_at)` — 티켓 변경 이력
- `attachments(ticket_id)`, `comments(ticket_id, created_at)` — 상세 화면

## 6. 새 환경 적용 순서

1. Cloudflare에서 D1 데이터베이스와 R2 버킷을 새로 만듭니다.
2. 배포 설정의 D1/R2 바인딩과 환경변수를 새 리소스 이름으로 설정합니다. 비밀값은 Git에 넣지 않습니다.
3. `drizzle/`의 migration을 순서대로 적용합니다.
4. 앱을 실행합니다. `app/api/ticket-schema.ts`의 `ensureTicketSchema()`가 오래된 DB와의 호환을 위한 누락 테이블·열·인덱스를 한 번 더 보완합니다.
5. 첫 사용자 가입 신청을 만들고, D1에서 승인 상태와 관리자 권한을 부여합니다. 현재 앱은 모든 가입을 승인 대기로 생성합니다.
6. 프로젝트를 만들고 멤버를 추가한 뒤 티켓을 생성합니다.

## 7. Git에 포함하지 않는 것

다음은 이 저장소에 넣지 않습니다.

- D1의 실제 사용자·프로젝트·티켓·댓글·감사 로그 데이터
- R2에 저장된 실제 첨부파일
- `.env` 파일, Cloudflare API 토큰, 비밀번호, 세션 데이터
- 로컬 실행 산출물(`node_modules`, `.wrangler`, `tsconfig.tsbuildinfo`)

따라서 이 저장소를 새 환경에 clone하면 기능과 DB 설계는 재사용할 수 있지만, 실제 업무 데이터는 새 DB에서 시작합니다.
