# ENCEPHLIAN: Solo Founder Execution Plan

**Reality:** It's just you. No team. No external support yet.

**This document ruthlessly prioritizes what ONE person can actually execute.**

---

## PRINCIPLE: DO LESS, BETTER

### What Gets OUTSOURCED (must-have, can't do solo)

1. **DevOps Infrastructure** → Contractor (₹100-150K / 4 weeks)
   - Why: Too much toil for you to build + operate simultaneously
   - What you hire for: Terraform setup, migrations, CI/CD, monitoring
   - Timeline: Week 1 (hire immediately)
   - Cost: Part of $25K budget

2. **Database Migration** → Contractor or managed service
   - Why: One mistake kills all clinic data
   - Timeline: Week 2-3 (while contractor does Terraform)
   - Cost: ~$50K or use Azure DMS (auto-tool)

### What YOU Do (core founder work)

1. **Product** — Real AI inference, triage accuracy
2. **First Clinic Sales** — Personal relationships, demos, feedback loops
3. **Open-Source A-Plane** — GitHub + community engagement

### What Gets DEFERRED (do later when you have budget/team)

- ❌ Tier 2 clinic expansion (Month 6+)
- ❌ OEM partnerships (Month 9+)
- ❌ Advanced vendor adapters (Philips, GE, Masimo) — let community do it
- ❌ Real finance/ops person
- ❌ Marketing website, content, paid ads

---

## REALISTIC SOLO FOUNDER TIMELINE: 12 WEEKS

### Week 1: SETUP (You hire, then unlock)

**Monday:**
- [ ] Post on Angel List, Upwork for DevOps contractor (₹100-150K for 4 weeks)
- [ ] Interview 2-3 candidates (look for someone who's done Terraform + Azure)
- [ ] Offer to highest fit
- [ ] Explain: "Build infrastructure while I handle product + sales"

**Tuesday-Wednesday:**
- [ ] Create GitHub org for "encephlian-infrastructure" (separate from product repos)
- [ ] Write Terraform PRD for contractor (use AZURE_IMPLEMENTATION_GUIDE.md as template)
- [ ] Set up Terraform backend (Azure Storage)
- [ ] Share contractor access to Azure + GitHub

**Thursday-Friday:**
- [ ] Start: Azure ML integration (connect real inference)
- [ ] Update Read API to use actual model (not placeholder)
- [ ] Test locally: Upload EEG → Real triage output

**By end of Week 1:**
- ✅ Contractor hired, working on Terraform
- ✅ You're 60% done with real AI inference
- ✅ DevOps toil offloaded

### Week 2-3: PARALLEL TRACK

**You (Product + Sales):**
- [ ] Finish Azure ML integration
- [ ] Real PDF report generation (use triage model output)
- [ ] Deploy to existing Container App (test)
- [ ] Research 50 Tier-1 neurology clinics (names, emails, phones)
- [ ] Draft sales email template (personalized, not bulk)
- [ ] Send cold outreach to first 20 clinics
- [ ] Book first 2-3 demos

**Contractor (Infrastructure):**
- [ ] Complete Terraform (all resources)
- [ ] PostgreSQL migration (dry run + actual)
- [ ] Auth setup (Azure AD B2C skeleton)
- [ ] 4 Container Apps created
- [ ] CI/CD skeleton (GitHub Actions)

### Week 4: MOMENTUM

**You (Product + Sales):**
- [ ] First 2-3 demos with clinics (10-15 min each)
- [ ] Get feedback: "What works? What's missing?"
- [ ] Offer free pilot (10 triage tokens, no credit card)
- [ ] Implement quickest fixes based on feedback
- [ ] Launch first pilot with 1 clinic (manual triage, you run it)

**Contractor:**
- [ ] CI/CD workflows done (deploy-internal-stable, deploy-pilot-stable)
- [ ] Database fully migrated + validated
- [ ] Auth fully working (AD B2C + custom claims)
- [ ] Cost monitoring set up (alerts at $1K/month)

**Handoff to Contractor (if extending):**
- [ ] Weekly syncs (15 min): "What's blocking? What do you need from me?"
- [ ] Payment (weekly, transparent)
- [ ] Infrastructure is now self-service for you (deploy with 1 GitHub click)

### Week 5-8: SCALE (Contractor DONE, you running solo again)

**Focus: First paying clinic**

- [ ] Run triage for pilot clinic's first 5 studies (manually)
- [ ] Get feedback: "Did this save time? Accurate?"
- [ ] If YES → offer ₹500/month plan (10 tokens)
- [ ] If NO → debug + iterate (free)

**Parallel:**
- [ ] Send 20 more cold emails (Week 5)
- [ ] Follow up with first 20 (Week 6)
- [ ] Book 2-3 more demos (Week 7-8)
- [ ] Launch 2-3 more pilots

**Product (only if blocking):**
- [ ] Multi-file EEG upload (if clinics ask)
- [ ] Export reports as PDF (if clinics need)
- [ ] Don't build: advanced analytics, dashboards, new pages

**Infrastructure (minimal):**
- [ ] Monitor cost (should be ~$800/mo)
- [ ] Check health checks (should be green)
- [ ] Trust the contractor's setup (if well-built, should just work)

### Week 9-12: VALIDATION

**Goal: 2-3 clinics paying + proven product-market fit**

- [ ] Close first 2-3 clinics (₹500-1,000/month each)
- [ ] Weekly clinic check-ins (15 min each)
- [ ] Document: "What did they like? What's missing?"
- [ ] Build ONLY based on clinic feedback

**Parallel:**
- [ ] Publish encephlian-aplane on GitHub (simple, well-documented)
- [ ] Write CONTRIBUTING.md (how to add vendors)
- [ ] Tweet: "We're open-sourcing EEG vendor adapters"
- [ ] Expect: 0-2 community PRs (don't worry if none yet)

**Metrics by Week 12:**
- ✅ 2-3 clinics paying (₹1,500-3,000 MRR)
- ✅ Infrastructure stable (99%+ uptime)
- ✅ Real triage AI working
- ✅ Product-market fit signal (clinics coming back, not churning)

---

## CONTRACTOR REQUIREMENTS

### What to Look For

**Must-haves:**
- ✅ 2+ years Azure experience (Container Apps, PostgreSQL, Functions)
- ✅ Terraform (Infrastructure as Code)
- ✅ CI/CD (GitHub Actions)
- ✅ Can work async (you might be in clinic meetings)
- ✅ Deliverable mindset ("Done = working in production, tested, documented")

**Nice-to-haves:**
- Python (understands your backend)
- Healthcare (understands HIPAA/data sensitivity)
- India-based (timezone, cost alignment)

### What to NOT Hire For

- ❌ Full-stack engineer (too expensive, not focused)
- ❌ Fractional CTO (overkill for your stage)
- ❌ AWS expert (you're going Azure)
- ❌ Someone who needs close management

### Where to Find

1. **Angel List Talent** (remote, vetted)
2. **Upwork** (search: "Terraform + Azure + CI/CD")
3. **LinkedIn** (search: "DevOps" + "India" + "Azure")
4. **Local Bangalore/Delhi tech communities** (Slack groups, etc.)

### Contractor Agreement

**Budget:** ₹100-150K for 4 weeks (~$1,200-1,800 USD)
**Scope:** Deliver working, tested, documented infrastructure (all terraform files, docs, runbooks)
**Timeline:** Start Week 1, handoff by end of Week 4
**Communication:** Daily async (Slack), weekly 30-min sync
**Payment:** Weekly (₹25-37K every Friday, based on milestones)

**Milestones:**
1. Week 1: Terraform written (not applied yet) → code review
2. Week 2: Resources created, DB migrated → tested
3. Week 3: CI/CD working, auth done → all 4 apps deployable
4. Week 4: Cost monitoring set up, docs complete → you can run it solo

---

## SOLO FOUNDER WORKFLOW (Post-Contractor)

### Daily (1-2 hours)

**Morning (30 min):**
- Check health checks (all 4 Container Apps green? ✅)
- Check cost monitoring (still < $800/mo? ✅)
- If red flag: email contractor for quick fix

**Late afternoon (30-60 min):**
- Clinic support (check Slack/email for clinic questions)
- Demo preparation (if demos booked)

### Weekly (6-8 hours)

**Monday (2 hours):**
- Cold outreach (5-10 personalized emails to clinics)
- Follow-ups (emails to clinics from last week)

**Tuesday-Wednesday (3-4 hours):**
- Demos + pilots with clinics
- Get feedback, iterate product

**Thursday (1-2 hours):**
- Code changes (only if blocking pilots)
- Deploy to production (1-click GitHub Action, contractor set up)

**Friday (1 hour):**
- Metrics check-in (MRR, clinic count, uptime)
- Plan next week

### Monthly (1 day)

- Finance check: Contractor invoice, Azure invoice, burn rate
- Roadmap: What worked? What to focus on next month?
- Document: Update clinic testimonials, case study, etc.

---

## PRODUCT FOCUS (What YOU Build)

### Must-Have (Do first)

1. **Real Azure ML Integration** (Week 1-2)
   - Connect Read API to Azure ML endpoint
   - Pass EEG signals → Get predictions
   - Return: seizures, artifacts, sleep stages, etc.
   - Deploy to prod (using contractor's CI/CD)

2. **PDF Report Generation** (Week 2-3)
   - Template: Study metadata + AI findings + confidence
   - Clinic downloads report (shown in UI)
   - No AI generation yet; just format + display

3. **Multi-file Upload** (Week 4-5, if clinics ask)
   - Upload 3 EEG files at once
   - Run triage on all, batch report
   - Only if 2+ clinics request

### Nice-to-Have (Skip for now)

- ❌ Advanced dashboards (analytics, trends)
- ❌ Clinic-specific branding (internal SKU only)
- ❌ Export to EHR (complex integration)
- ❌ Mobile app (out of scope)
- ❌ Clinic admin page (internal only)
- ❌ Audit logs (log to CloudWatch for now)

### What Contractor Gave You (Use, don't rebuild)

- ✅ Realtime triage updates (SignalR) — already wired
- ✅ Edge functions (Azure Functions) — already working
- ✅ Auth (Azure AD B2C) — already set up
- ✅ CI/CD (GitHub Actions) — just commit + push
- ✅ Cost tracking — dashboards already exist

---

## SALES FOCUS (What YOU Do Personally)

### Tier 1 Clinic Outreach (Your Job)

**Research (Week 1, 8 hours):**
```
50 Tier-1 clinics, organized by city:
├─ Delhi: 15 clinics (neurology + radiology centers)
├─ Mumbai: 15 clinics
├─ Bangalore: 15 clinics
└─ Chennai: 5 clinics

For each: Name, Dr. names, clinic email, phone, website, equipment
```

**Cold Outreach (Weeks 2-4, 1 hour/day):**
```
Day 1: Email 10 clinics
  Subject: "EEG triage AI for [Clinic Name]"
  Body (personalized):
    "Hi Dr. Sharma,

    I came across your clinic (specializing in neurology) and thought
    you might be interested in MIND—an AI that auto-triages EEG studies
    in seconds vs. 2-3 hours.

    We're piloting with 2-3 clinics in Delhi right now. Would you be
    open to a quick 15-min demo? (First 10 triages free, no credit
    card needed.)

    Let me know your availability this week.

    Best,
    Hitesh"

Day 2: Email 10 more clinics
Day 3: Follow up with Day 1 (if no response)
Day 4-5: Repeat
```

**Demo (15 min each):**
```
1. Intro (2 min)
   "MIND is an AI assistant for EEG triage. You upload an EEG,
    it auto-analyzes channels, detects seizures/artifacts/abnormalities,
    and gives a report in 30 seconds."

2. Live demo (10 min)
   - Show dashboard
   - Upload sample EEG (you pre-have one ready)
   - Run triage (auto-inference)
   - Show report
   - Highlight: "Saves 2 hours vs. manual"

3. Ask (3 min)
   "Want to try 10 free triages with your own patients?
    No credit card, no commitment. You just upload, we give reports."
```

**Pilots (You manually run for first 3-5 clinics):**
```
Clinic 1:
  - Day 1: Get clinic's first EEG file
  - Day 1 (evening): Run triage manually, send report
  - Day 2: Ask: "Accurate? Saved time?"
  - Day 3: If YES → "Let's talk pricing. ₹500/month gets 10 triages."
          If NO → "Let's debug. Do 2 more free."

Clinic 2-5: Repeat
```

### Sales Playbook (Copy-Paste)

**Email Template:**
```
Subject: 15-min EEG triage AI demo for [Clinic Name]

Hi Dr. [Name],

I'm Hitesh, building MIND—an AI that auto-analyzes EEGs in 30 seconds.

Instead of 2-3 hours per EEG, you get:
- Automated channel analysis
- Seizure/artifact detection
- Machine-readable report

We're piloting with clinics in Delhi right now. Curious to see if it
works for your clinic?

I can show you in 15 minutes (Zoom or in-person if you're in Delhi).
First 10 triages are on us (no credit card).

Available: [Your available times]

Let me know if you're interested.

Best,
Hitesh
(Founder, Encephlian)
Phone: [Your phone]
```

**Pricing (Keep Simple):**
```
Starter: ₹500/month (10 triages)
Growth:  ₹1,500/month (50 triages)
Plus:    ₹500/month per 10 more

1 triage = 1 EEG file, all channels analyzed
```

### Sales Metrics (Track Weekly)

```
Week 2: 20 emails sent, 0 demos booked
Week 3: 30 emails + 5 follow-ups, 2 demos booked
Week 4: 10 demos done, 2 pilots launched
Week 5: 1 clinic converting to paid, 5 more pilots
Week 6: 2 paid clinics (₹1,000 MRR), 8 pilots in progress
```

---

## OPEN-SOURCE A-PLANE (Build momentum, minimal effort)

### Launch (Week 5, 4 hours)

**Monday:**
- [ ] Create public GitHub repo: `encephlian-aplane`
- [ ] Copy vendor adapter code from encephlian-core
- [ ] Add README (what is A-Plane, why open-source)
- [ ] Add CONTRIBUTING.md (how to add vendors)
- [ ] Create GitHub Discussions (vendor requests)

**Tuesday:**
- [ ] Write blog post: "We're open-sourcing EEG vendor adapters"
  - Why: "Vendor adapters are infrastructure utilities. Let's build them together."
  - What: "First 3 vendors (EDF, Natus, Nihon Kohden). Want to add Philips/GE?"
  - How: "Submit PR. We'll review + merge + release to PyPI."
- [ ] Tweet: Link to blog + repo
- [ ] Post on Reddit r/HealthTech, r/Python

**Metrics:**
- 100+ stars by Week 6 (organic reach)
- 0-1 PRs by Week 8 (still early)

### Ongoing (1 hour/month)

- Check GitHub issues (answer vendor requests)
- Review any PRs (respond within 1 week)
- Monthly release (if new code merged)

---

## FINANCIAL REALITY (12 Months, Solo)

### Burn Rate

**Infrastructure:**
- Azure: $800/month ($9,600/year)
- GitHub/tools: $50/month ($600/year)
- **Total OpEx: $10,200/year** ✅ Within $25K budget

**Contractor (first 4 weeks only):**
- DevOps: ₹150K ($1,800)
- Database migration: $500 (use Azure DMS or DIY)
- **Contractor: ~$2,500 one-time**

**Your costs:**
- Laptop (already have)
- Internet (already have)
- Coffee (on you 😄)
- **Your living expenses: Self-funded** (before revenue)

### Revenue (Solo Founder Achievable)

```
Month 1-2:   $0 (setup + first pilots)
Month 3:     ₹500 (1 clinic)
Month 4:     ₹1,500 (2-3 clinics)
Month 5-6:   ₹5,000 (5-10 clinics)
Month 7-9:   ₹15,000 (15-20 clinics)
Month 10-12: ₹30,000 (30-50 clinics)

Year 1 Revenue: ₹70-100K direct
Year 1 Profit: ₹70-100K revenue - $12K opex = **₹50-80K positive**
```

### Profitability Timeline

- **Month 6:** Cash flow positive (revenue ≥ OpEx)
- **Month 8:** Real profit (runway extends indefinitely)
- **Month 12:** Enough to hire part-time sales contractor (if needed)

---

## CRITICAL PATH: What CAN'T Wait

### Must Do (Week 1-2)

1. **Hire DevOps contractor** — Infrastructure too complex to DIY
2. **Azure ML inference** — Can't sell without real AI
3. **First cold email** — Founder sales is your only CAC right now

### Can Defer (after Month 3)

- ❌ Fancy dashboards
- ❌ Advanced analytics
- ❌ Vendor partnerships (let them come to you)
- ❌ OEM discussions
- ❌ Scaling to Tier 2 clinics

---

## WEEKLY STANDUP (Just for You)

**Every Friday, 15 minutes:**

1. **Did we hit this week's targets?**
   - Emails sent: ____
   - Demos booked: ____
   - Pilots launched: ____
   - Code deployed: ____

2. **Infrastructure health?**
   - Cost: < $800/mo? ✅ or ❌
   - Uptime: > 99%? ✅ or ❌
   - Deployments: Auto-working? ✅ or ❌

3. **What's blocking?**
   - Product issue? ← Fix yourself
   - Infrastructure issue? ← Email contractor
   - Sales rejection? ← Learn, move on

4. **Next week priority?**
   - If no revenue yet: Focus on sales/demos
   - If 1+ clinic paying: Focus on retention + one more
   - If all good: Keep the flywheel turning

---

## THE SOLO FOUNDER MINDSET

### What's Hard

- **No one to delegate to** — Every task falls on you
- **Task switching** (DevOps → Sales → Product in one day)
- **Loneliness** — No cofounder to bounce ideas off
- **Imposter syndrome** — Questioning every decision

### What's Your Edge

- **Speed** — No meetings, no consensus, just ship
- **Customer intimacy** — You know every clinic, personally
- **Capital efficiency** — Every dollar is burn rate awareness
- **Founder story** — Investors love solo founders who validate (you → $100M)

### Mindset Rules

1. **Do one thing at a time, but switch fast.**
   - 3 hours: Cold outreach (sales focus)
   - 2 hours: Product work (AI inference)
   - 1 hour: Monitor infrastructure (if contractor did job well)

2. **Delegate ruthlessly.**
   - Can't do DevOps + Sales + Product simultaneously
   - Pay contractor $1,800 to save yourself 40 hours (worth it)

3. **Talk to customers constantly.**
   - Every clinic interaction = 10x more valuable than guessing
   - Adjust product based on what they say

4. **Celebrate small wins.**
   - First email sent: 🎉
   - First demo booked: 🎉
   - First clinic paying: 🎉

---

## 12-WEEK SOLO FOUNDER EXECUTION CHECKLIST

### Week 1: SETUP
- [ ] Hire DevOps contractor (₹100-150K, 4 weeks)
- [ ] Share Terraform PRD + Azure access
- [ ] Start Azure ML integration
- [ ] Research 50 Tier-1 clinics

### Week 2: TRACTION
- [ ] Finish Azure ML integration + test
- [ ] Send 20 cold emails
- [ ] Book 2-3 demos
- [ ] Contractor 40% through Terraform

### Week 3: MOMENTUM
- [ ] 3-4 demos done
- [ ] First 1-2 pilots launched
- [ ] Send 20 more cold emails
- [ ] Contractor 80% through infrastructure

### Week 4: VALIDATION
- [ ] Contractor delivers infrastructure (done)
- [ ] You deploy real AI to prod (first time)
- [ ] 2-3 pilots in progress
- [ ] Get clinic feedback

### Week 5-6: SCALE
- [ ] Publish open-source A-Plane
- [ ] Close first paying clinic (₹500/month)
- [ ] 5-10 pilots in pipeline
- [ ] Deploy to Pilot-Stable track (real customers)

### Week 7-8: MOMENTUM
- [ ] 2-3 paid clinics (₹1,500-2,500 MRR)
- [ ] Real uptime/stability data (99%+)
- [ ] Cost tracking confirms ~$800/mo
- [ ] Product working, clinics happy

### Week 9-10: GROWTH
- [ ] 5-10 paid clinics (₹5,000+ MRR)
- [ ] Contractor relationship ends (you running solo)
- [ ] Runbooks + monitoring solid (no daily toil)
- [ ] First GitHub star/interest on A-Plane

### Week 11-12: PROOF
- [ ] 10+ paid clinics (₹10,000 MRR annualized)
- [ ] Revenue > OpEx
- [ ] Infrastructure stable (you're confident)
- [ ] Documented case studies + testimonials

---

## IF THINGS GO WRONG

**Scenario 1: Contractor doesn't deliver**
- Week 2 check-in: Is code ready? If no, find new contractor immediately
- Cost: Restart, but still < $5K total
- Prevention: Check references, small 1-week trial first

**Scenario 2: First 5 clinics say NO**
- Not product. Could be: pricing, fit, demo, timing
- Solution: Ask them why. Adjust pitch. Keep going.
- Don't panic until 20 cold pitches with <5% conversion

**Scenario 3: Azure ML integration doesn't work**
- Fallback: Keep placeholder AI + manual triage (you run manually)
- Revenue doesn't depend on AI being perfect (yet)
- Focus: Get clinics using it, refine AI later

**Scenario 4: Infrastructure cost exceeds $800/mo**
- Likely cause: Auto-scaling too aggressive (too many replicas running)
- Solution: Adjust scaling rules (cap max replicas lower)
- Check contractor did cost optimization correctly

**Scenario 5: You're burning out**
- This is the hardest. Solo founding is lonely.
- Solution: Talk to someone (advisor, friend, therapist, online community)
- Pace: Sprint 4 weeks, then 1-week rest. No marathon burnout.

---

## SUCCESS METRICS (What "Done" Looks Like)

### By Week 4 (Infrastructure Done)
- ✅ Contractor delivers working infrastructure
- ✅ Azure ML triage working in production
- ✅ 2-3 clinics in active pilot

### By Week 8 (Product-Market Fit Signal)
- ✅ 1-2 clinics paying (₹1,000+ MRR)
- ✅ Infrastructure 99%+ uptime
- ✅ Zero manual operational toil
- ✅ Clinic NPS > 7/10

### By Week 12 (Proof Point)
- ✅ 5-10 clinics paying (₹5,000+ MRR)
- ✅ Revenue > infrastructure costs
- ✅ Strong testimonials + case studies
- ✅ Clear roadmap for next 3 months

---

## NEXT ACTION (Right Now)

### Do This Today (30 min)

1. Post on Upwork: "DevOps engineer needed (Terraform + Azure + 4 weeks)"
   - Budget: ₹100-150K
   - Description: [Copy from CONTRACTOR section above]

2. Post on Angel List Talent (same job)

3. Ask on Twitter: "Looking for DevOps contractor (Azure + Terraform, India-based, 4 weeks)"

### By End of Week 1

- Contractor hired + started
- You working on Azure ML inference
- Research spreadsheet created (50 clinics)

---

**You've got this.**

**One person, clear priorities, contractor handling infrastructure toil, you handling customers + product.**

**12 weeks to prove it works.**

**🚀**

---

**Document Version:** 1.0 (Solo Founder Edition)
**Status:** READY FOR EXECUTION
**Timeline:** 12 weeks to product-market fit signal
