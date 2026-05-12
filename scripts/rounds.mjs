// SJRU Sunday Minis 2026 — round schedule and host venues.
//
// Each Sunday in the season has up to two host venues: one for U6/U7 and one
// for U8/U9. Sometimes both age bands share a venue (Rounds 1, 2, 13). The
// schedule comes from the LCJRU 2026 club calendar, which mirrors the SJRU
// Sunday Minis circular — Sunday Minis is centrally drawn, so every club
// playing in the comp travels to these hosts.
//
// Source: https://github.com/denishoctor/lcjru-fixtures/blob/main/scripts/events.mjs
// Used by:
//   - scripts/fetch-fixtures.mjs to roll up rounds[] into fixtures.json so the
//     browser can render "what's on this weekend" even when the Rugby Xplorer
//     feed hasn't published a particular round yet
//   - docs/index.html welcome view to show "Sun 17 May · U6/U7 at Wakehurst,
//     U8/U9 at Melwood" headlines

export const ROUNDS = [
  { round:  1, date: '2026-05-03', u6u7: 'Tryon Oval',              u8u9: 'Tryon Oval'              },
  { round:  2, date: '2026-05-10', u6u7: 'Tunks Park',              u8u9: 'Tunks Park'              },
  { round:  3, date: '2026-05-17', u6u7: 'Wakehurst Rugby Park',    u8u9: 'Melwood Oval'            },
  { round:  4, date: '2026-05-24', u6u7: 'Beauchamp Park',          u8u9: 'Bantry Bay Oval'         },
  { round:  5, date: '2026-05-31', u6u7: 'Tantallon Oval',          u8u9: 'Lofberg Oval'            },
  { round:  6, date: '2026-06-14', u6u7: 'Hassall Park',            u8u9: 'James Morgan Reserve'    },
  // Round 7 — bye weekend (long weekend / school holidays); no scheduled hosts.
  { round:  7, date: null,         u6u7: null,                      u8u9: null,         bye: true   },
  { round:  8, date: '2026-07-26', u6u7: 'Tunks Park',              u8u9: 'Beauchamp Park'          },
  { round:  9, date: '2026-08-02', u6u7: 'Mark Taylor Oval',        u8u9: 'Wakehurst Rugby Park'    },
  { round: 10, date: '2026-08-09', u6u7: 'Melwood Oval',            u8u9: 'Tantallon Oval'          },
  { round: 11, date: '2026-08-16', u6u7: 'Wakehurst Rugby Park',    u8u9: 'Mark Taylor Oval'        },
  { round: 12, date: '2026-08-23', u6u7: 'Lofberg Oval',            u8u9: 'Beauchamp Park'          },
  { round: 13, date: '2026-08-30', u6u7: 'Hassall Park',            u8u9: 'Hassall Park', finalRound: true },
];
