# Failure scenarios to test

| Scenario | Expected behavior | Status |
|---|---|---|
| Concurrent requests compete for the final units | Never reserve more than available stock | Integration test included |
| Client retries after response loss | Same key and same request returns stored order response | Integration test included |
| Same key used with different body | Return 409; do not create another order | Integration test included |
| Order item insert fails after inventory update | Entire transaction rolls back | Add fault-injection test |
| PostgreSQL unavailable at startup | Process exits non-zero with an error log | Implemented; verify locally |
| Redis unavailable | Readiness returns 503; liveness remains healthy | Implemented; verify locally |
| Duplicate payment webhook | Apply business transition once | Not implemented |
| Reservation expiry races with payment | One valid terminal outcome; stock changes once | Not implemented |
| Outbox worker crashes after publish | Event may be delivered again; consumer is idempotent | Not implemented |

Do not mark a scenario complete until it has an automated test or a documented manual verification with observed output.
