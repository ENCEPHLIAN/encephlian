# ENCEPHLIAN: Stakeholder Quick Reference Guide

**Who should read what, and why.**

---

## FOR FOUNDERS / EXECUTIVES

**Read in order:**
1. **STRATEGIC_ROADMAP_SUMMARY.md** (15 min)
   - Vision, current state, 3-part strategy
   - Financial projections, success metrics
   - 30-day execution checklist

2. **A_PLANE_OPENSOURCE_STRATEGY.md** — Section III (Go-to-Market) (20 min)
   - Clinic sales playbook
   - OEM distribution model
   - Founder's 90-day playbook

3. **AZURE_MIGRATION_STRATEGY.md** — Section 1-2 (Architecture, Budget) (15 min)
   - Understand the infrastructure shift
   - Know cost structure ($800/mo)

**Why:** Make strategic decisions, manage team, close first clinics

**Action:** Use 30-day checklist to drive execution

---

## FOR DEVOPS / INFRASTRUCTURE ENGINEERS

**Read in order:**
1. **AZURE_IMPLEMENTATION_GUIDE.md** — All sections (45 min)
   - Complete Terraform code
   - Exact cost breakdown
   - Deployment matrix
   - SKU-to-infrastructure mapping

2. **AZURE_MIGRATION_STRATEGY.md** — Sections 3-9 (Database, Functions, Scaling) (30 min)
   - Database migration steps
   - Azure Functions setup
   - Auto-scaling rules

3. **STRATEGIC_ROADMAP_SUMMARY.md** — Success criteria + monitoring (10 min)
   - Understand what "done" looks like

**Why:** Build and deploy infrastructure autonomously

**Action:** Start with Terraform setup (Week 1), database migration (Week 2), then CI/CD (Week 3)

**Key files to create:**
- `terraform/` directory (8 files)
- `.github/workflows/deploy-*.yml` (4 workflows)
- Monitoring dashboards in Azure Monitor

---

## FOR SOFTWARE ENGINEERS (BACKEND)

**Read in order:**
1. **A_PLANE_OPENSOURCE_STRATEGY.md** — Sections I-II (Architecture, Contribution Workflow) (30 min)
   - Understand vendor adapter architecture
   - See how community PRs work

2. **AZURE_MIGRATION_STRATEGY.md** — Sections 5-6 (Edge Functions, Realtime) (20 min)
   - Replace 18 Supabase functions with Azure Functions
   - Implement SignalR for realtime updates

3. **STRATEGIC_ROADMAP_SUMMARY.md** — Product roadmap (10 min)
   - Know what Phase 1/2/3 entails

**Why:** Implement vendor adapters, Azure Functions, realtime signaling

**Action:** Start with EDF adapter (reference), then implement Natus adapter (from stubs)

**Key tasks:**
- Convert 18 Supabase edge functions to Azure Functions
- Implement vendor adapters (Natus, Philips, GE)
- Connect Azure ML for inference

---

## FOR FRONTEND / PRODUCT ENGINEERS

**Read in order:**
1. **AZURE_MIGRATION_STRATEGY.md** — Sections 4, 8 (Auth, Frontend Hosting) (20 min)
   - Auth migration (Supabase → Azure AD B2C)
   - Frontend deployment (Lovable → Static Web Apps)

2. **A_PLANE_OPENSOURCE_STRATEGY.md** — Section III (Go-to-Market) — specifically clinic flows (15 min)
   - Understand UX for clinic onboarding
   - See what "1-click triage" means

3. **STRATEGIC_ROADMAP_SUMMARY.md** — Product roadmap (10 min)

**Why:** Update frontend for auth/API changes, optimize clinic UX

**Action:** Start with auth migration (Week 1-2), then Real AI integration (Week 4-8)

**Key tasks:**
- Migrate from Supabase Auth to Azure AD B2C (MSAL library)
- Update API endpoints (from Supabase to Azure)
- Integrate real triage inference (instead of placeholder)
- Add multi-file EEG upload

---

## FOR SALES / BUSINESS DEVELOPMENT

**Read in order:**
1. **A_PLANE_OPENSOURCE_STRATEGY.md** — Section III (Go-to-Market) (30 min)
   - Sales playbook for Tier-1 clinics
   - OEM distribution model
   - Pricing model

2. **STRATEGIC_ROADMAP_SUMMARY.md** — Financial projections (10 min)
   - Understand unit economics

3. **AZURE_MIGRATION_STRATEGY.md** — skim Sections 1-2 (20 min)
   - Understand why infrastructure matters (reliability = customer trust)

**Why:** Sell the product, sign clinics, negotiate OEM partnerships

**Action:** Use sales playbook template, start outreach to 50 clinics (Week 3-4)

**Key assets:**
- Sales pitch (elevator + full)
- Demo script (15 min)
- Pricing deck
- OEM partnership proposal template

---

## FOR INVESTORS / ADVISORS

**Read in order:**
1. **STRATEGIC_ROADMAP_SUMMARY.md** — Sections: Vision, Current State, 3-Part Strategy, Financial Projections (20 min)
   - Quick overview of the business

2. **A_PLANE_OPENSOURCE_STRATEGY.md** — Sections I, III (Architecture, Go-to-Market) (20 min)
   - Understand competitive moat
   - Understand GTM strategy

3. **AZURE_MIGRATION_STRATEGY.md** — Sections 1, 14-15 (Architecture, Success Criteria, Risks) (20 min)
   - Understand operational rigor
   - Risk mitigation

**Why:** Evaluate investment opportunity, provide strategic guidance

**Action:** Ask clarifying questions, assess founder, make decision

**Key metrics:**
- TAM: 1B+ people in India, 500 neurology clinics in Tier-1
- SAM: 500 clinics × ₹1K/month = ₹60 crores/year potential
- Path to $100M: 5-10 years (similar to health-tech exits in India)
- Tech risk: LOW (proven architecture, no hard problems)
- Market risk: MEDIUM (founder-led sales, new market, regulatory unknowns)
- Capital efficiency: HIGH ($25K credits covers Year 1 infrastructure)

---

## FOR PRODUCT MANAGERS

**Read in order:**
1. **STRATEGIC_ROADMAP_SUMMARY.md** — All sections (30 min)
   - Understand the complete picture

2. **A_PLANE_OPENSOURCE_STRATEGY.md** — Sections I, III (Architecture, Go-to-Market) (25 min)
   - Understand product layers (A/C/I-planes)
   - Understand clinic needs

3. **AZURE_MIGRATION_STRATEGY.md** — Sections 1-2, 14-15 (Architecture, Success Criteria) (15 min)

**Why:** Define roadmap, prioritize features, align with business goals

**Action:** Translate strategic roadmap into quarterly OKRs and engineering tickets

**Key decisions:**
- Q1 2026: Core infrastructure + real AI inference
- Q2 2026: Multi-clinic + OEM framework
- Q3 2026: Vendor partnerships + scale to 50 clinics
- Q4 2026+: Fine-tuning models + adjacent products

---

## FOR OPERATIONS / SUPPORT

**Read in order:**
1. **STRATEGIC_ROADMAP_SUMMARY.md** — Success criteria + monitoring (10 min)
   - Know what "operational health" means

2. **AZURE_MIGRATION_STRATEGY.md** — Section 14 (Runbooks) (20 min)
   - Understand incident response procedures

3. **AZURE_IMPLEMENTATION_GUIDE.md** — Section on monitoring (15 min)
   - Understand dashboards + alerting

**Why:** Keep systems running, respond to incidents, support customers

**Action:** Create runbooks, train team, set up on-call rotation

**Key responsibilities:**
- Monitor infrastructure (CPU, memory, latency)
- Respond to alerts (database full, scaling issues, etc.)
- Manage clinic support tickets
- Track performance metrics (uptime, error rate, cost)

---

## FOR OPEN-SOURCE CONTRIBUTORS

**Read in order:**
1. **A_PLANE_OPENSOURCE_STRATEGY.md** — Sections I-II (Architecture, Contribution Workflow) (30 min)
   - Understand architecture
   - See how to add a vendor

2. **CONTRIBUTING.md** (from encephlian-aplane GitHub) (10 min)
   - Contribution guidelines
   - Code of conduct

**Why:** Contribute vendor adapters, help build the standard

**Action:** Fork, implement adapter, submit PR

**Example tasks:**
- Implement Natus adapter (from existing stubs)
- Implement Philips adapter
- Add tests + documentation
- Get merged, see your code used by thousands of clinics

---

## READING TIME REFERENCE

| Role | Total Time | Key Documents |
|------|-----------|---|
| Founder | 60 min | STRATEGIC_ROADMAP_SUMMARY + A_PLANE (GTM) + AZURE (Overview) |
| DevOps | 90 min | AZURE_IMPLEMENTATION_GUIDE + AZURE_MIGRATION (detailed) |
| Backend Eng | 60 min | A_PLANE + AZURE (Functions) |
| Frontend Eng | 50 min | AZURE (Auth + Hosting) + A_PLANE (GTM) |
| Sales | 40 min | A_PLANE (GTM) + STRATEGIC_ROADMAP_SUMMARY |
| Investor | 60 min | STRATEGIC_ROADMAP_SUMMARY + A_PLANE + AZURE (Risk) |
| PM | 70 min | STRATEGIC_ROADMAP_SUMMARY + A_PLANE + AZURE (Overview) |
| Operations | 45 min | STRATEGIC_ROADMAP_SUMMARY + AZURE (Runbooks) |
| Open-Source Contributor | 40 min | A_PLANE + CONTRIBUTING |

---

## QUICK REFERENCE: KEY NUMBERS

**Business:**
- TAM: 1B+ people in India, underserved by neurology
- Target clinics: 500 in Tier-1 (Phase 1)
- Year 1 revenue target: ₹30K (direct) + ₹100K+ (OEM) monthly by December
- Pricing: ₹500-2,000/month per clinic (pay-per-triage)

**Infrastructure:**
- Monthly cost: ~$800 (Container Apps + DB + Storage + Functions)
- Replicas: 2 always-on (1 backup), auto-scales to 4-8 during peaks
- Uptime target: 99.5% (1 nine)
- Latency target: < 200ms (p95)

**Team:**
- Founder: Full-time (now)
- DevOps: Part-time contractor (Month 1-2) → Full-time (Month 3+)
- Sales: Founder-led (Months 1-3), then hire (Month 4+)
- Engineering: Founder + 1-2 contractors (Phase 2)

**Timeline:**
- Week 1-3: Infrastructure groundwork
- Week 4-12: Multi-replica, CI/CD, first sales
- Month 4-6: Scale to 10-20 clinics, start OEM talks
- Month 7-12: Scale to 50+ clinics, solidify OEM partnership
- Year 2: 200-300 clinics, 3-5 OEM partnerships, $60-100K MRR

---

## COMMON QUESTIONS

**Q: Why is open-source A-Plane important?**
A: Vendor adapters are infrastructure utilities (not core IP). Open-sourcing attracts community, accelerates vendor support, and positions you as the industry standard. This makes it easier to build the moat around C+I planes (your proprietary models).

**Q: Why multi-replica on Container Apps?**
A: Hospital clinics can't afford downtime. Multi-replica + auto-scaling ensures reliability during peak hours (when clinicians are seeing patients). It also reduces operational burden (no manual interventions).

**Q: Why Azure instead of AWS/GCP?**
A: You're optimizing for cost + India region availability. Azure has $25K credits + strong regional presence. AWS would be similar; GCP is smaller in India.

**Q: Why is founder-led sales critical in Year 1?**
A: You don't have a sales team yet. Founder involvement builds trust with neurologists, provides rapid feedback on product, and validates product-market fit before scaling.

**Q: What's the biggest risk?**
A: Market risk (can you convince Indian clinics to adopt?), not technical risk. Infrastructure is proven (Container Apps, PostgreSQL, etc.). De-risk by getting first 5 paying clinics ASAP.

---

## NEXT STEP: PICK YOUR ROLE

**If you're the Founder:**
→ Read STRATEGIC_ROADMAP_SUMMARY (execute Week 1 checklist)

**If you're joining as DevOps:**
→ Read AZURE_IMPLEMENTATION_GUIDE (start Terraform setup)

**If you're joining as Sales:**
→ Read A_PLANE_OPENSOURCE_STRATEGY (Section III) (start prospecting)

**If you're joining as Backend Engineer:**
→ Read A_PLANE_OPENSOURCE_STRATEGY (Sections I-II) (implement adapters)

**If you're a potential investor/advisor:**
→ Read STRATEGIC_ROADMAP_SUMMARY + A_PLANE (GTM) (evaluate opportunity)

---

**Document Complete**

**Questions?** Refer to the specific strategic document for your role.

**Ready to build?** 🚀

---

**Prepared:** March 21, 2026
**Status:** READY FOR EXECUTION
