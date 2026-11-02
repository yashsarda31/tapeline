import { load, meta } from '../lib/data.js';
import { date, int, pctAbs } from '../lib/fmt.js';
import { h } from '../lib/ui.js';

export async function render(root) {
  const [m, sg] = await Promise.all([meta(), load('signals')]);
  root.append(h(`<div class="ph"><div><div class="eyebrow">Methodology</div><h1>How the numbers are made</h1>
    <p>A number that hasn't been checked against what happened next is decoration. This page explains how each one on the site was checked.</p></div></div>`));
  root.append(h(`<div class="prose">
    <h2>Data</h2>
    <p>Prices, volumes and delivery come from NSE end-of-day files and Yahoo Finance via a local warehouse. Most stocks have daily history from mid-2021, and every test needs a full year of history plus a full liquid universe, so <b>signals, breadth and factors are measured from ${date(m.test_start)} to ${date(m.asof)}</b>. Regime tables based on India VIX use index history back to 2009. Fundamentals, analyst consensus, shareholding, insider trades and bulk/block deals come from the same warehouse. Global indices come from Yahoo Finance. Everything is end-of-day; nothing here is live.</p>
    <p>Corporate actions are a classic source of fake signals: a 1:1 bonus looks like a 50% crash. Returns are cleaned with a traded-value rule. A split or bonus changes the price but leaves rupee turnover continuous, while a genuine collapse makes turnover spike. Any daily move larger than 35% without a turnover spike of at least 4.6× is treated as an artifact. ${m.artifacts} such artifacts were neutralised in this build.</p>

    <h2>The universe</h2>
    <p>The ${int(m.symbols)} stocks are the members of the Nifty Total Market index. Every test and every breadth reading uses a <b>point-in-time liquid universe</b>: on each date, the ${m.liquid_n} names with the highest 60-day median traded value that also have at least a year of history. That is close to how the Nifty 500 is built, and it means a stock only counts on dates when it was actually tradable at size.</p>

    <h2>How a signal is tested</h2>
    <p>For every date and every stock in the liquid universe, each screen is either triggered or not. Repeat triggers within 10 sessions count as one event (20 for moving-average crosses). For each event we compute the stock's return over the next 5, 20 and 60 sessions, minus the equal-weight return of the whole liquid universe over the same window. That difference is the <b>excess return</b>. Measuring against the market strips out the market's own drift, so a screen that only fires in bull runs doesn't look clever.</p>
    <p>Events cluster: on a strong day dozens of stocks break out together, and their outcomes are not independent. The t-statistic is therefore <b>cluster-robust</b>, with clusters formed by non-overlapping blocks of the holding period. In practice this cuts the effective sample by a factor of ten or more compared with a naive t-test.</p>
    <p>The label on each screen follows a rule fixed before the results were read, on the 20-session horizon:</p>
    <ul>
      <li><b>Measured edge</b>: t ≥ 2, a positive average in both the first and second half of the event history, and an average excess return still above zero after a ${pctAbs(sg.cost, 1)} round-trip cost.</li>
      <li><b>Works in reverse</b>: t ≤ −2 and negative in both halves.</li>
      <li><b>No measured edge</b>: everything else.</li>
    </ul>
    <p>For bearish screens the signs flip: a measured edge means the stocks went on to underperform.</p>

    <h2>Breadth and regimes</h2>
    <p>Breadth counts the liquid universe: the share above their own 50- and 200-day averages, new 52-week closing highs and lows, and the McClellan oscillator (19/39-day EMA spread of net advances as a share of issues). The regime tables on the market page group every session since 2014 by its reading and report the Nifty 50's return over the following 20 and 60 sessions. These windows overlap heavily, so the independent-period count shown in the tooltips is days ÷ horizon. A group's t-statistic tests its mean against the all-days mean, not against zero.</p>

    <h2>Sectors and rotation</h2>
    <p>Sector and industry composites are equal-weight averages of daily returns of their liquid members, rebased over time. The relative rotation graph uses weekly data. RS-ratio is the composite's ratio to the universe, z-scored over 14 weeks and centred on 100. RS-momentum is the z-scored weekly rate of change of RS-ratio. This is the common public approximation of the JdK method; it is not identical to the licensed version.</p>

    <h2>Factors</h2>
    <p>At each month-end the liquid universe is ranked on each characteristic and split into quintiles. Quintiles are held equal-weight, from the next session, through the following month. The headline line is the daily return of the top quintile minus the bottom quintile, compounded, gross of costs. Value and quality are deliberately absent: the warehouse has no reliable point-in-time fundamentals before 2023, and testing on today's ratios would use information that wasn't available at the time.</p>

    <h2>Known limitations</h2>
    <ul>
      <li><b>Short history.</b> Roughly four years of tests cover a strong bull run, a correction and a recovery, but not a full cycle. Treat every edge here as provisional. Backfilling the warehouse's full-market NSE bhavcopy archive (which reaches back to 1994 and includes delisted stocks) would extend the tests and remove survivorship at the same time.</li>
      <li><b>Survivorship.</b> The stock list is today's index membership, so companies that delisted or were dropped are missing from history. This flatters long-side signals and momentum. Measuring every signal against the same survivor universe offsets part of the bias but not all of it.</li>
      <li><b>Costs and capacity.</b> Apart from the verdict's cost hurdle, results are gross. Slippage in smaller names can be much larger than the assumed cost.</li>
      <li><b>Fundamentals are snapshots.</b> P/E, ROE and analyst targets are the latest values from Yahoo key stats, refreshed on a rolling basis, so a few may be several days old.</li>
      <li><b>Past is not future.</b> A measured edge is evidence that something worked historically, net of noise. Markets change, and well-known effects get crowded.</li>
    </ul>
    <h2>Not investment advice</h2>
    <p>This site is a research tool for education. It does not recommend buying or selling any security, and nothing here accounts for your circumstances. Consult a SEBI-registered adviser before acting.</p>
  </div>`));
}
