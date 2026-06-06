# Email draft — Azure for Startups credit unlock escalation

To: Abu A. (Azure for Startups program contact, original email Apr 18)
From: Hitesh / ENCEPHLIAN
Subject: ENCEPHLIAN — Azure for Startups, request for credit-unlock review

---

Hi Abu,

Thank you again for the $25,000 credit approval back in April. I wanted to reach out for guidance on the unlock process since the standard criterion is hard to meet at our pre-pilot stage, and I want to make sure we use the program correctly rather than work around it.

**Where we are**

ENCEPHLIAN is a clinical EEG platform built for Indian neurology clinics. We are pre-revenue, pre-pilot, and currently deep in the model-validation phase. Our infrastructure on Azure:

- 1 × E64as_v5 VM (`tuh-download-vm`) — hosts the TUH EEG academic corpus and runs MIND model training (currently mid-training a 30-epoch AEGIS artifact-detection model on TUAR; ~70 hours of CPU)
- 3 × Container Apps in Central India (encephlian-iplane, encephlian-cplane, enceph-readapi) — production inference + canonicalization + read path
- Storage: `encephblob` (eeg-raw, eeg-canonical, eeg-derived, eeg-reports — ~3 TB of medical-grade signal data + processed ESF tensors)
- Front Door + WAF (Standard SKU)
- Supabase (off-Azure), Vercel (off-Azure for the frontend)

**Spend since 18 April: ~$3,053 USD (254,615 INR)** of the unlocked $10,000.

**The unlock criterion bottleneck**

The criterion is $100/month on Azure Monitor / Log Analytics / Application Insights / Microsoft Defender for Cloud / Microsoft Sentinel / Microsoft Purview. We are at ~$52-62/month projected on these services, even after expanding Defender Standard plans from 8 to 15 yesterday (added VirtualMachines P2, App Service, Container Registry, API P1, AI Services, OpenSourceRelationalDatabases, SqlServers — many preemptive since the instances don't exist yet).

The structural gap: the eligible services bill per-resource or per-volume. Without pilot users generating HTTP traffic, our Container Apps + Front Door log volume stays under the Log Analytics free 5 GB/month tier ($0). Without a fleet of VMs or App Services, Defender's per-instance charges stay capped at our tiny resource footprint. We could enable Log Analytics Commitment Tier (100 GB/day minimum, ~$5,900/month) to force the threshold, but that would burn the remaining $7,000 of unlocked credit in 36 days for no real product value.

**What we genuinely need this credit for**

Three things, all imminent:

1. **AEGIS training compute** — TUAR-trained artifact detection model. Currently running 30 epochs on CPU (~3 days wall-time per training run). Moving this to an Azure ML GPU instance (NCv3 or similar) at $3-5/hour × 6 hours per run would cost ~$200-400/run. With 4-6 expected re-trains before clinical deployment, that's $1,500-2,500.
2. **Pilot rollout** — Container Apps scaling for the first 5 pilot clinics. Per-clinic load is small (5-20 studies/week), but reliability requires min-replica 2 across 3 services × 5 instances = real Container Apps compute spend. We project ~$200-400/month per active clinic on Container Apps + Storage + Front Door, so the first month of a 5-clinic pilot is ~$1,500.
3. **CDSCO Class B audit infrastructure** — backup retention, audit log retention, immutable blob storage for the 5+ year retention requirement. This is essentially Storage + Backup spend, which is not Defender-eligible but is contractually mandatory.

**The ask**

Could you review whether the criterion can flex for our case, given:
- We have real, growing spend ($3,053 since April — clearly committed to Azure as the production cloud)
- We are pre-pilot and the eligible services genuinely don't have load to bill until clinics onboard
- The intended use of the next $15K is operational (pilot scaling + Class B compliance + GPU training), all of which is genuine Azure consumption

Happy to:
- Provide a 30/60/90 day spend projection
- Document the specific Azure services we will scale into
- Set up a monthly check-in on actual consumption
- Move our edge functions / additional observability onto eligible Azure services where it makes architectural sense

If the criterion is firm and the only path is to manufacture eligible-service spend, please let me know and I'll plan around the constraint. I'd rather flag this early than scramble at the credit-exhaustion mark.

Thank you for the program and for thinking through this with us.

Hitesh
hitesh@encephlian.cloud
www.encephlian.cloud
