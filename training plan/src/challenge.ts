export const BIRTHDAY = "2027-05-11";
export const TAPER_START = "2027-03-28";
export const CHALLENGE_START = "2027-04-11";
// May 2 and May 9 are open reattempt days for whichever goal is still unmet.
export const REATTEMPT_DATES = ["2027-05-02", "2027-05-09"] as const;
export const FLEX_DATE = REATTEMPT_DATES[0];
export const ATTEMPTS = [
  { date: CHALLENGE_START, goal: "Murph" },
  { date: "2027-04-18", goal: "5K" },
  { date: "2027-04-25", goal: "10K" },
] as const;
