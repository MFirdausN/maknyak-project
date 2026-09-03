# Domain Map

| Domain       | Tanggung jawab                                              | Entitas inti                         | Tahap   |
| ------------ | ----------------------------------------------------------- | ------------------------------------ | ------- |
| Identity     | Principal, credential federation, session, service identity | User, Identity, Session              | Core    |
| Workspace    | Multi-tenancy dan akses organisasi                          | Workspace, Membership, Role, Project | Core    |
| Gateway      | Public API composition, rate limiting, request context      | Route, Client policy                 | Core    |
| Audit        | Rekaman aksi penting yang append-only                       | Audit event                          | Core    |
| AI           | Model access, conversation, prompt, tool execution          | Conversation, Model, Prompt, Run     | Next    |
| Notification | Preference dan pengiriman pesan                             | Template, Delivery, Preference       | Next    |
| Storage      | Metadata dan policy object                                  | Object, Bucket policy                | Next    |
| Search       | Indexing dan retrieval lintas produk                        | Index, Document                      | Later   |
| Billing      | Plan, entitlement, metering, invoice                        | Account, Subscription, Usage         | Later   |
| Automation   | Trigger dan workflow execution                              | Workflow, Trigger, Execution         | Later   |
| Marketplace  | Distribusi integration/agent/template                       | Listing, Installation                | Horizon |

## Ownership rules

- Hanya Identity yang mengubah principal/session.
- Hanya Workspace yang mengubah membership, role, dan project.
- Billing menentukan entitlement; domain pemakai tetap mengotorisasi aksi.
- Notification tidak memiliki business workflow; ia bereaksi pada command/event.
- AI tidak membaca tabel domain lain secara langsung.
- Shared package hanya berisi primitive atau contract stabil, bukan business logic lintas domain.

## Istilah

- **User:** manusia yang dapat menjadi principal.
- **Principal:** actor terautentikasi, manusia atau service.
- **Workspace:** batas tenant dan unit kolaborasi.
- **Organization:** informasi legal/commercial; tidak identik dengan tenant pada versi awal.
- **Project:** pengelompokan resource di dalam workspace.
