# Agents

Phase 3 dimulai dengan `project-planner-v1` pada service AI. Runtime menyimpan
job, step, approval, capability grant, dan artifact pada schema PostgreSQL
`agent`. Implementasi tetap berada di service AI sampai beban atau ownership
domain membenarkan ekstraksi service tersendiri.

Safety boundary awal:

- worker hanya mengklaim job melalui `FOR UPDATE SKIP LOCKED`;
- lease stale dipulihkan setelah dua menit dan retry dibatasi tiga kali;
- publish artifact berhenti pada human approval;
- approval hanya menerbitkan scope `artifact.write` selama satu jam;
- capability direvoke setelah sekali digunakan;
- artifact JSON dibatasi 256 KiB dan memiliki SHA-256 checksum;
- semua read/mutation tetap melalui authorization Workspace.
