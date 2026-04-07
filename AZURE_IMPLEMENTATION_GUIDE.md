# ENCEPHLIAN: Azure Implementation Guide (Tactical)

**Level:** Implementation Engineers
**Focus:** Terraform code, exact costs, deployment matrices
**Version:** 1.0
**Date:** March 2026

---

## PART I: TERRAFORM INFRASTRUCTURE AS CODE

### Project Structure

```
encephlian-infrastructure/
├── terraform/
│   ├── main.tf                    # Azure provider, locals, vars
│   ├── resource_group.tf          # Resource Group
│   ├── key_vault.tf               # Secrets management
│   ├── database.tf                # PostgreSQL Flexible
│   ├── storage.tf                 # Blob Storage + containers
│   ├── container_apps.tf          # 4 Read API replicas
│   ├── functions.tf               # 18 Azure Functions
│   ├── signalr.tf                 # SignalR Service
│   ├── api_management.tf          # API Gateway
│   ├── static_web_apps.tf         # Frontend hosting
│   ├── monitoring.tf              # Alerts, dashboards
│   ├── variables.tf               # Input variables
│   ├── outputs.tf                 # Output values
│   ├── terraform.tfvars           # Environment-specific values
│   └── terraform.tfvars.example   # Template (check into Git)
├── .gitignore
├── .terraform.lock.hcl            # Lock provider versions
├── backend.tf                     # Azure Storage backend
└── README.md
```

### 1. Provider & Backend Setup

**main.tf:**
```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.85"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.46"
    }
  }

  # Store Terraform state in Azure Storage (not local)
  backend "azurerm" {
    resource_group_name  = "encephlian-terraform"
    storage_account_name = "encephterraform"
    container_name       = "tfstate"
    key                  = "prod.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    postgresql_flexible_server {
      restart_server_on_configuration_value_change = false
    }
  }

  skip_provider_registration = false
}

provider "azuread" {}

locals {
  project_name = "encephlian"
  environment  = var.environment  # prod, staging, dev
  location     = var.azure_region  # eastus, centralindia, etc.

  tags = {
    Project     = local.project_name
    Environment = local.environment
    ManagedBy   = "Terraform"
    CreatedAt   = timestamp()
  }
}

# Data source: current Azure subscription
data "azurerm_client_config" "current" {}
```

**variables.tf:**
```hcl
variable "azure_region" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "Environment (prod, staging, dev)"
  type        = string
  validation {
    condition     = contains(["prod", "staging", "dev"], var.environment)
    error_message = "Must be prod, staging, or dev."
  }
}

variable "resource_group_name" {
  description = "Name of resource group"
  type        = string
  default     = "encephlian-rg"
}

variable "container_apps" {
  description = "Container Apps to deploy"
  type = map(object({
    sku              = string  # internal, pilot
    version          = string  # stable, experimental
    min_replicas     = number
    max_replicas     = number
    cpu              = number
    memory           = string
  }))
  default = {
    "internal-stable" = {
      sku          = "internal"
      version      = "stable"
      min_replicas = 1
      max_replicas = 4
      cpu          = 0.5
      memory       = "1Gi"
    }
    "internal-experimental" = {
      sku          = "internal"
      version      = "experimental"
      min_replicas = 0
      max_replicas = 2
      cpu          = 0.5
      memory       = "1Gi"
    }
    "pilot-stable" = {
      sku          = "pilot"
      version      = "stable"
      min_replicas = 1
      max_replicas = 3
      cpu          = 0.5
      memory       = "1Gi"
    }
    "pilot-experimental" = {
      sku          = "pilot"
      version      = "experimental"
      min_replicas = 0
      max_replicas = 1
      cpu          = 0.5
      memory       = "1Gi"
    }
  }
}

variable "postgres_sku" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "Standard_B2s"  # 2 vCores, 4 GB RAM: ~$300/mo
}

variable "storage_account_tier" {
  description = "Storage account tier"
  type        = string
  default     = "Standard"
}

variable "backup_retention_days" {
  description = "Database backup retention"
  type        = number
  default     = 7
}
```

**terraform.tfvars.example (check into Git, rename to terraform.tfvars locally):**
```hcl
azure_region         = "eastus"  # or "centralindia" for India region
environment          = "prod"
resource_group_name  = "encephlian-rg"
postgres_sku         = "Standard_B2s"
storage_account_tier = "Standard"
backup_retention_days = 7
```

**outputs.tf:**
```hcl
output "resource_group_id" {
  value = azurerm_resource_group.main.id
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "postgres_admin_login" {
  value = azurerm_postgresql_flexible_server.main.administrator_login
}

output "postgres_password" {
  value     = random_password.postgres_password.result
  sensitive = true
}

output "storage_account_id" {
  value = azurerm_storage_account.main.id
}

output "storage_primary_blob_endpoint" {
  value = azurerm_storage_account.main.primary_blob_endpoint
}

output "container_apps" {
  value = {
    for name, app in azurerm_container_app.read_api : name => {
      fqdn             = app.latest_revision_fqdn
      latest_revision  = app.latest_revision_name
      replica_count    = length(app.template[0].scale[0].rules)
    }
  }
}

output "signalr_endpoint" {
  value = azurerm_signalr_service.main.hostname
}

output "static_web_app_default_hostname" {
  value = azurerm_static_web_app.main.default_host_name
}

output "key_vault_id" {
  value = azurerm_key_vault.main.id
}

output "application_insights_instrumentation_key" {
  value     = azurerm_application_insights.main.instrumentation_key
  sensitive = true
}
```

### 2. Resource Group & Key Vault

**resource_group.tf:**
```hcl
resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.azure_region

  tags = local.tags
}

# For Terraform state storage
resource "azurerm_resource_group" "terraform" {
  name     = "${var.resource_group_name}-terraform"
  location = var.azure_region

  tags = local.tags
}
```

**key_vault.tf:**
```hcl
# Create Key Vault for secrets (DB password, API keys, etc.)
resource "azurerm_key_vault" "main" {
  name                = "enceph-kv-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  # Security: Require AD authentication, audit all access
  sku_name            = "standard"  # or "premium" for HSM
  tenant_id           = data.azurerm_client_config.current.tenant_id
  enable_rbac_authorization = true

  # Soft delete for safety
  soft_delete_retention_days = 90
  purge_protection_enabled   = true

  tags = local.tags
}

# Access policy: Terraform service principal
resource "azurerm_key_vault_access_policy" "terraform" {
  key_vault_id       = azurerm_key_vault.main.id
  tenant_id          = data.azurerm_client_config.current.tenant_id
  object_id          = data.azurerm_client_config.current.object_id  # Current user/sp

  key_permissions    = ["Get", "List"]
  secret_permissions = ["Get", "List", "Set", "Delete", "Purge", "Recover"]
}

# Access policy: Container Apps (read secrets)
resource "azurerm_key_vault_access_policy" "container_apps" {
  key_vault_id       = azurerm_key_vault.main.id
  tenant_id          = data.azurerm_client_config.current.tenant_id
  object_id          = azurerm_container_app_environment.main.identity[0].principal_id

  secret_permissions = ["Get", "List"]
}

# PostgreSQL password (auto-generated)
resource "random_password" "postgres_password" {
  length  = 32
  special = true
}

resource "azurerm_key_vault_secret" "postgres_password" {
  name         = "postgres-password"
  value        = random_password.postgres_password.result
  key_vault_id = azurerm_key_vault.main.id

  tags = local.tags
}

# Read API key (secret)
resource "azurerm_key_vault_secret" "read_api_key" {
  name         = "read-api-key"
  value        = var.read_api_key  # Pass via terraform.tfvars or env var
  key_vault_id = azurerm_key_vault.main.id

  tags = local.tags
}

# Random suffix for globally unique names
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}
```

### 3. PostgreSQL Database

**database.tf:**
```hcl
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "enceph-postgres-${local.environment}"
  location               = azurerm_resource_group.main.location
  resource_group_name    = azurerm_resource_group.main.name

  # Admin credentials
  administrator_login    = "postgres"
  administrator_password = random_password.postgres_password.result

  # Compute SKU (2 vCores, 4 GB RAM)
  sku_name   = var.postgres_sku  # Standard_B2s: ~$300/mo

  # Storage
  storage_mb = 32768  # 32 GB (can auto-grow)

  # Version
  version = "14"

  # Backups
  backup_retention_days = var.backup_retention_days  # 7 days
  geo_redundant_backup_enabled = local.environment == "prod" ? true : false

  # High availability (optional, adds 50% cost)
  # high_availability_enabled = local.environment == "prod" ? true : false

  # Network (allow Azure services + my IP)
  public_network_access_enabled = true

  tags = local.tags

  depends_on = [azurerm_resource_group.main]
}

# Firewall: Allow Azure services
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"  # Azure internal range
}

# Firewall: Allow admin IP (for Terraform local runs)
resource "azurerm_postgresql_flexible_server_firewall_rule" "admin_ip" {
  name             = "AllowAdminIP"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = var.admin_ip  # Your IP, e.g., "1.2.3.4"
  end_ip_address   = var.admin_ip
}

# Database within PostgreSQL server
resource "azurerm_postgresql_flexible_server_database" "encephlian" {
  name      = "encephlian"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Connection pooling: PgBouncer (optional, managed separately)
# Consider running PgBouncer in a Container App for local pooling
```

### 4. Azure Storage (Blob Storage)

**storage.tf:**
```hcl
resource "azurerm_storage_account" "main" {
  name                     = "enceph${random_string.suffix.result}"
  location                 = azurerm_resource_group.main.location
  resource_group_name      = azurerm_resource_group.main.name
  account_tier             = var.storage_account_tier  # Standard or Premium
  account_replication_type = "LRS"  # Locally redundant (GRS for geo-redundancy)

  # Network: Allow all for now (restrict via CORS + SAS later)
  public_network_access_enabled = true

  # Disable unnecessary features
  https_traffic_only_enabled = true

  tags = local.tags
}

# Containers (logical grouping)
resource "azurerm_storage_container" "clinic_files" {
  name                  = "clinic-files"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"  # No public read
}

resource "azurerm_storage_container" "eeg_signals" {
  name                  = "eeg-signals"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "reports" {
  name                  = "reports"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Lifecycle policy: Archive old EEG files (> 30 days) to cheap tier
resource "azurerm_storage_management_policy" "archive" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "archive-old-eeg"
    enabled = true

    filters {
      prefix_match = ["eeg-signals/"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days   = 30
        tier_to_archive_after_days = 90
        delete_after_days          = 365  # Delete after 1 year
      }
    }
  }
}

# Storage account key (for access)
resource "azurerm_key_vault_secret" "storage_key" {
  name         = "storage-account-key"
  value        = azurerm_storage_account.main.primary_access_key
  key_vault_id = azurerm_key_vault.main.id

  tags = local.tags
}
```

### 5. Container Apps (Read API Replicas)

**container_apps.tf:**
```hcl
# Container App Environment (shared across all apps)
resource "azurerm_container_app_environment" "main" {
  name                           = "enceph-env"
  location                       = azurerm_resource_group.main.location
  resource_group_name            = azurerm_resource_group.main.name
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.main.id

  tags = local.tags
}

# Managed Identity (for Key Vault access)
resource "azurerm_user_assigned_identity" "container_apps" {
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  name                = "enceph-container-apps-identity"

  tags = local.tags
}

# Grant identity access to Key Vault
resource "azurerm_role_assignment" "container_apps_kv" {
  scope              = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id       = azurerm_user_assigned_identity.container_apps.principal_id
}

# Container Apps (4 instances: internal-stable, internal-exp, pilot-stable, pilot-exp)
resource "azurerm_container_app" "read_api" {
  for_each = var.container_apps

  name                         = "enceph-read-api-${each.key}"
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Multiple"  # For blue-green deployments

  template {
    # Container specification
    container {
      name             = "read-api"
      image            = "ghcr.io/your-org/encephlian-read-api:latest"
      cpu              = each.value.cpu
      memory           = each.value.memory
      startup_probe {
        path            = "/health"
        port            = 8787
        interval_seconds = 10
        timeout_seconds = 3
      }

      # Environment variables
      env {
        name  = "ENCEPH_DATA_ROOT"
        value = "/app/data"
      }
      env {
        name  = "PORT"
        value = "8787"
      }
      env {
        name  = "SKU"
        value = each.value.sku
      }
      env {
        name  = "VERSION"
        value = each.value.version
      }
      # Read DB password from Key Vault
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"  # Stored in Key Vault
      }
      # Read API key from Key Vault
      env {
        name        = "ENCEPH_READ_API_KEY"
        secret_name = "read-api-key"
      }
    }

    # Auto-scaling rules
    scale {
      min_replicas = each.value.min_replicas
      max_replicas = each.value.max_replicas

      # Scale up on high CPU
      rules {
        name             = "cpu"
        custom_rule_type = "cpu"
        cpu {
          threshold = 70  # Scale up if CPU > 70%
        }
        scale_direction = "Up"
        scale_amount    = 1
        cooldown_period = 120  # Wait 2 min before next scale
      }

      # Scale down on low CPU
      rules {
        name             = "cpu-down"
        custom_rule_type = "cpu"
        cpu {
          threshold = 20  # Scale down if CPU < 20%
        }
        scale_direction = "Down"
        scale_amount    = 1
        cooldown_period = 300  # Wait 5 min before scaling down
      }

      # Scale on request count
      rules {
        name             = "requests"
        custom_rule_type = "http"
        http {
          concurrent_requests = 100
        }
        scale_direction = "Up"
        scale_amount    = 1
        cooldown_period = 60
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8787
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_apps.id]
  }

  tags = local.tags

  depends_on = [
    azurerm_container_app_environment.main,
    azurerm_key_vault_access_policy.container_apps,
  ]
}

# Output container app FQDNs
output "container_app_fqdns" {
  value = {
    for key, app in azurerm_container_app.read_api : key => app.latest_revision_fqdn
  }
}
```

### 6. Azure Functions

**functions.tf:**
```hcl
resource "azurerm_storage_account" "functions" {
  name                     = "encephfn${random_string.suffix.result}"
  location                 = azurerm_resource_group.main.location
  resource_group_name      = azurerm_resource_group.main.name
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = local.tags
}

resource "azurerm_app_service_plan" "functions" {
  name                = "enceph-functions-plan"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  kind                = "FunctionApp"
  reserved            = false  # Windows runtime

  sku {
    tier = "Dynamic"  # Pay-per-execution (Consumption Plan)
    size = "Y1"       # Always free tier
  }

  tags = local.tags
}

resource "azurerm_function_app" "main" {
  name                       = "enceph-functions"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  app_service_plan_id        = azurerm_app_service_plan.functions.id
  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key

  # Runtime
  os_type            = "linux"
  runtime_stack      = "python"
  runtime_version    = "3.11"

  # App settings
  app_settings = {
    AzureWebJobsStorage     = azurerm_storage_account.functions.primary_connection_string
    FUNCTIONS_WORKER_PROCESS_COUNT = "2"

    # Read API
    READ_API_URL  = azurerm_container_app.read_api["internal-stable"].latest_revision_fqdn
    READ_API_KEY  = azurerm_key_vault_secret.read_api_key.value

    # Database
    DATABASE_URL  = azurerm_key_vault_secret.postgres_url.value

    # Storage
    STORAGE_ACCOUNT_NAME = azurerm_storage_account.main.name
    STORAGE_ACCOUNT_KEY  = azurerm_storage_account.main.primary_access_key

    # SignalR
    SIGNALR_CONNECTION_STRING = azurerm_signalr_service.main.primary_connection_string

    # Razorpay
    RAZORPAY_KEY_ID     = var.razorpay_key_id
    RAZORPAY_KEY_SECRET = var.razorpay_key_secret

    # Application Insights
    APPINSIGHTS_INSTRUMENTATION_KEY = azurerm_application_insights.main.instrumentation_key
  }

  identity {
    type = "SystemAssigned"
  }

  tags = local.tags

  depends_on = [
    azurerm_app_service_plan.functions,
    azurerm_storage_account.functions,
  ]
}

# Azure Queue Storage (for async triage processing)
resource "azurerm_storage_queue" "triage_queue" {
  name                 = "triage-queue"
  storage_account_name = azurerm_storage_account.functions.name
}

resource "azurerm_storage_queue" "inference_queue" {
  name                 = "inference-queue"
  storage_account_name = azurerm_storage_account.functions.name
}

# Output function URL
output "function_app_url" {
  value = azurerm_function_app.main.default_hostname
}
```

### 7. SignalR Service

**signalr.tf:**
```hcl
resource "azurerm_signalr_service" "main" {
  name                = "enceph-signalr"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  sku {
    name     = "Free_F1"  # 1 unit, 1K concurrent users (free)
    capacity = 1
  }

  # Features
  cors {
    allowed_origins = ["https://app.encephlian.com"]  # Restrict CORS
  }

  # Service mode (best for client connections)
  service_mode = "Default"

  # Enable client connection logs
  features {
    enable_client_connection_logs = true
    enable_message_logs           = false  # Verbose; disable in prod
  }

  tags = local.tags
}

# Store connection string in Key Vault
resource "azurerm_key_vault_secret" "signalr_connection" {
  name         = "signalr-connection-string"
  value        = azurerm_signalr_service.main.primary_connection_string
  key_vault_id = azurerm_key_vault.main.id

  tags = local.tags
}

output "signalr_endpoint" {
  value = azurerm_signalr_service.main.hostname
}
```

### 8. Monitoring & Alerts

**monitoring.tf:**
```hcl
# Log Analytics Workspace (for logs + metrics)
resource "azurerm_log_analytics_workspace" "main" {
  name                = "enceph-analytics"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"  # Pay-per-GB
  retention_in_days   = 30

  tags = local.tags
}

# Application Insights (for app-level telemetry)
resource "azurerm_application_insights" "main" {
  name                = "enceph-insights"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.main.id

  tags = local.tags
}

# Alert Group (email recipients)
resource "azurerm_monitor_action_group" "main" {
  name                = "enceph-alerts"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  email_receiver {
    name           = "admin-email"
    email_address  = var.alert_email
    use_common_alert_schema = true
  }

  tags = local.tags
}

# Alert: High CPU on Container Apps
resource "azurerm_monitor_metric_alert" "cpu_high" {
  for_each = var.container_apps

  name                = "HighCPU-${each.key}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.read_api[each.key].id]

  criteria {
    metric_name      = "CpuUsagePercentage"
    operator         = "GreaterThan"
    threshold        = 80
    aggregation      = "Average"
    metric_namespace = "Microsoft.App/containerApps"
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = local.tags
}

# Alert: Database connection pool exhausted
resource "azurerm_monitor_metric_alert" "db_connections" {
  name                = "DBConnectionPoolExhausted"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_postgresql_flexible_server.main.id]

  criteria {
    metric_name      = "active_connections"
    operator         = "GreaterThan"
    threshold        = 95  # Out of 100 in pool
    aggregation      = "Average"
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = local.tags
}

# Alert: Triage function errors
resource "azurerm_monitor_metric_alert" "function_errors" {
  name                = "FunctionErrors"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_function_app.main.id]

  criteria {
    metric_name      = "FunctionExecutionCount"
    operator         = "GreaterThan"
    threshold        = 5
    aggregation      = "Total"
    metric_namespace = "Microsoft.Web/sites"
    dimensions {
      name     = "Status"
      operator = "Include"
      values   = ["Failed"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = local.tags
}

# Dashboard: Real-time system health
resource "azurerm_portal_dashboard" "main" {
  name                = "enceph-dashboard"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  dashboard_properties = jsonencode({
    lenses : {
      "0" : {
        order : 0
        parts : {
          "0" : {
            position : { x : 0, y : 0, colSpan : 6, rowSpan : 4 }
            metadata : {
              inputs : []
              type : "Extension/Microsoft_Azure_Monitoring/PartType/MetricsChartPart"
              settings : {
                content : {
                  metrics : [
                    {
                      name : "CpuUsagePercentage"
                      resourceMetadata : {
                        id : azurerm_container_app.read_api["internal-stable"].id
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  })

  tags = local.tags
}
```

---

## PART II: EXACT COST BREAKDOWN

### Monthly Compute Costs

| Service | Config | Quantity | Unit Price | Monthly Cost |
|---------|--------|----------|-----------|--------------|
| **Container Apps** |
| Internal-Stable | 0.5 vCPU, 1 GB RAM, min 1 | 1-4 replicas avg 2 | $0.0417/vCPU-hr + $0.0167/GB-hr | ~$120 |
| Internal-Experimental | 0.5 vCPU, 1 GB RAM, min 0 | 0-2 replicas avg 0.5 | " | ~$30 |
| Pilot-Stable | 0.5 vCPU, 1 GB RAM, min 1 | 1-3 replicas avg 1.5 | " | ~$90 |
| Pilot-Experimental | 0.5 vCPU, 1 GB RAM, min 0 | 0-1 replicas avg 0 | " | ~$0 |
| **Subtotal (Container Apps)** | | | | **~$240/mo** |
|
| **Azure Functions** |
| Execution time | 18 functions, avg 2s each, 100 calls/day | 36,000 GB-seconds/mo | $0.000016/GB-sec | ~$0.58 |
| Storage | Function code + configs | 100 GB | $0.024/GB | ~$2.40 |
| **Subtotal (Functions)** | | | | **~$3/mo** |
|
| **SignalR Service** |
| Free Tier | 1K concurrent connections | 1 unit | Free | **$0** |
| (or Standard: $1/day if usage exceeds) |
|
| **Static Web Apps** |
| Build + hosting | 100 GB bandwidth/mo | 1 instance | $0.00 (tier 1) or $0.20 (production) | **$0-20/mo** |
|
| **PostgreSQL Flexible Server** |
| Standard_B2s | 2 vCores, 4 GB RAM | 730 hours | $0.41/hour | ~$300 |
| Storage | 32 GB | 32 GB | $0.125/GB/mo | ~$4 |
| Backup | 7-day retention | included | | $0 |
| **Subtotal (Database)** | | | | **~$304/mo** |
|
| **Azure Storage** |
| Blob storage (Hot) | 500 GB clinic + EEG files | 500 GB | $0.0184/GB/mo | ~$9.20 |
| Blob storage (Archive) | 1 TB old EEG files (backups) | 1000 GB | $0.00099/GB/mo | ~$1 |
| Transactions | Read/write ops | 1M ops/mo | $0.004 per 10K ops | ~$0.40 |
| **Subtotal (Storage)** | | | | **~$11/mo** |
|
| **Networking** |
| Data egress (inter-region) | 10 GB/mo | 10 GB | $0.02/GB | ~$0.20 |
| Data egress (internet) | 50 GB/mo | 50 GB | $0.12/GB | ~$6 |
| **Subtotal (Networking)** | | | | **~$6.20/mo** |
|
| **Monitoring** |
| Application Insights | ~100 GB logs/mo | 100 GB | $2.34/GB | ~$234 |
| Log Analytics | Included with App Insights | | | $0 |
| **Subtotal (Monitoring)** | | | | **~$234/mo** |
|
| **Security** |
| Key Vault | <100 ops/mo | 1 vault | $0.34/vault | ~$0.34 |
| Managed Identity | 0 cost | | | $0 |
| **Subtotal (Security)** | | | | **~$0.34/mo** |
|
| **TOTAL MONTHLY COST** | | | | **~$799/mo** |
| **TOTAL ANNUAL COST (with buffer)** | | | | **~$10,000/year** |

### Scaling Cost Scenarios

**Scenario 1: Light Usage (Dev/Staging)**
- 1 Container App replica (internal-stable)
- PostgreSQL: Standard_B1s (1 vCore): ~$150/mo
- Monitoring: Half-enabled (cheaper tier)
- **Total: ~$200-300/mo**

**Scenario 2: Medium Usage (MVP Pilot Launch)**
- 2-3 Container App replicas (internal-stable + pilot-stable)
- PostgreSQL: Standard_B2s (2 vCore): ~$300/mo
- Full monitoring
- **Total: ~$800-1,000/mo** ← Current estimate

**Scenario 3: Heavy Usage (10+ Pilot Clinics)**
- 4+ Container App replicas (scaled, all tracks)
- PostgreSQL: Standard_D2s (4 vCore): ~$700/mo
- Premium monitoring + dashboards
- **Total: ~$1,500-2,000/mo**

**Scenario 4: Enterprise (100+ Clinics)**
- Multi-region deployment (3 regions)
- PostgreSQL: General Purpose tier (8+ vCore)
- Premium support
- **Total: ~$5,000-10,000/mo**

---

## PART III: DEPLOYMENT MATRIX

### SKU-to-Infrastructure Mapping

| Component | Internal-Stable | Internal-Experimental | Pilot-Stable | Pilot-Experimental |
|-----------|---|---|---|---|
| **Container App** |
| Name | enceph-read-api-internal-stable | enceph-read-api-internal-exp | enceph-read-api-pilot-stable | enceph-read-api-pilot-exp |
| Replicas (min-max) | 1-4 | 0-2 | 1-3 | 0-1 |
| Image tag | `main-latest` | `dev-latest` | `main-latest` | `staging-latest` |
| Deploy trigger | Auto on main push | Manual (workflow_dispatch) | Manual approval gate | Manual |
| SLA target | 99.5% | 95% best effort | 99.5% | N/A |
|
| **Environment Variables** |
| SKU | internal | internal | pilot | pilot |
| VERSION | stable | experimental | stable | experimental |
| READ_API_KEY | From Key Vault | From Key Vault | From Key Vault | From Key Vault |
| ENVIRONMENT | prod | staging | prod | staging |
|
| **Scaling Rules** |
| Scale trigger | CPU > 70% | CPU > 60% | CPU > 70% | CPU > 50% |
| Cooldown | 120s up, 300s down | 60s up, 300s down | 120s up, 300s down | 30s up, 300s down |
|
| **Monitoring** |
| Dashboards | Real-time + historical | Dev logs | Real-time | Dev logs |
| Alert recipients | ops@encephlian.com | dev@encephlian.com | ops@encephlian.com | dev@encephlian.com |
| Retention | 90 days | 30 days | 90 days | 30 days |

### Deployment Workflow (GitHub Actions)

```
┌─ Push to main ─────────────────────────────────┐
│                                                 │
├─→ Build Docker image                          │
│   └─→ Test (unit + integration)                │
│                                                 │
├─→ Push to ghcr.io (private registry)          │
│                                                 │
├─→ INTERNAL-STABLE Deployment (AUTO)           │
│   ├─ Deploy to Container App                   │
│   ├─ Health check (5 min)                      │
│   ├─ If OK → Traffic switch (100%)             │
│   └─ If FAIL → Auto-rollback to previous       │
│                                                 │
├─→ PILOT-STABLE Deployment (MANUAL APPROVAL)   │
│   ├─ Await approval (GitHub environment)      │
│   ├─ Deploy to Container App                   │
│   ├─ Canary: 10% traffic (5 min)              │
│   ├─ If OK → 100% traffic                      │
│   └─ If FAIL → Rollback to canary             │
│                                                 │
└─→ Notify on Slack                             │
    ├─ Deployment status                         │
    └─ Performance metrics (latency, errors)    │
```

### Rollback Procedure

**Automatic (if health check fails):**
```bash
# Container Apps auto-reverts to previous revision
# (configured in Terraform: revision_mode = "Multiple")
# Timeline: < 30 seconds
```

**Manual (if production issue detected):**
```bash
# Step 1: Identify previous good revision
az container app revision list --name enceph-read-api-internal-stable

# Step 2: Activate previous revision
az container app revision activate --name enceph-read-api-internal-stable \
  --revision enceph-read-api-internal-stable--abc123

# Step 3: Verify traffic shifted
az container app show --name enceph-read-api-internal-stable \
  --query "template.scale"

# Timeline: < 2 minutes
```

---

## PART IV: TERRAFORM DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] Azure subscription created (billing contact assigned)
- [ ] Service Principal created (for Terraform automation)
- [ ] GitHub secrets configured:
  - `AZURE_SUBSCRIPTION_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
- [ ] `terraform.tfvars` created (from `.tfvars.example`)
- [ ] Terraform state backend storage created (Azure Storage)

### Terraform Execution

```bash
# 1. Initialize Terraform
terraform init

# 2. Validate configuration
terraform validate

# 3. Preview changes
terraform plan -out=tfplan

# 4. Review plan (16+ resources)
# - Resource Group
# - Key Vault + secrets
# - PostgreSQL + database
# - Storage account + containers
# - 4 Container Apps (read_api)
# - Azure Functions
# - SignalR Service
# - Monitoring (Log Analytics, App Insights, Alerts)
# - Static Web Apps

# 5. Apply changes (30-45 min for first run)
terraform apply tfplan

# 6. Verify deployment
terraform output  # Shows FQDN, endpoints, connection strings
```

### Post-Deployment Validation

```bash
# Test Database
psql -h $(terraform output -raw postgres_fqdn) -U postgres -d encephlian -c "SELECT count(*) FROM users;"

# Test Container Apps
curl https://$(terraform output -json container_app_fqdns | jq -r '.["internal-stable"]')/health

# Test Storage
az storage container list --account-name $(terraform output -raw storage_account_name)

# Test Functions
curl https://$(terraform output -raw function_app_url)/api/health
```

---

**Document Complete**
**Ready for: Terraform Implementation Team**
**Next Step: Execute deployment plan (Section 13, AZURE_MIGRATION_STRATEGY.md)**
