# Datenbank-Diagramm (Vereinfachte Struktur)

## ER-Diagramm

```mermaid
erDiagram
    direction TB

    CUSTOMERS {
        integer id PK
        text name
        text created_at
        text updated_at
    }

    PRODUCTS {
        text id PK "synology-dsm, sophos-firewall, etc."
        text name
        text type "scraped|custom"
        integer active
        text created_at
    }

    PRODUCT_VERSIONS {
        integer id PK
        text product_id FK
        text version
        text source "scraped|ninjaone|unifi|sophos"
        text release_url
        text checked_at
        unique "product_id, version, source"
    }

    SETTINGS {
        text key PK
        text value
    }

    NINJAONE_CUSTOMERS {
        integer id PK
        integer customer_id FK "UNIQUE"
        text ninja_org_id "UNIQUE - externe Org-ID"
        text name
        text created_at
        text updated_at
    }

    NINJAONE_DEVICES {
        integer id PK
        integer ninjaone_customer_id FK
        text product_id FK
        text external_device_id "externe NinjaOne Device ID"
        text name
        text current_version
        text created_at
        text updated_at
    }

    UNIFI_CUSTOMERS {
        integer id PK
        integer customer_id FK "UNIQUE"
        text unifi_customer_id "UNIQUE - externe Kunden-ID"
        text name
        text created_at
        text updated_at
    }

    UNIFI_DEVICES {
        integer id PK
        integer unifi_customer_id FK
        text product_id FK
        text external_device_id "externe Unifi Device ID"
        text name
        text current_version
        text created_at
        text updated_at
    }

    SOPHOS_CUSTOMERS {
        integer id PK
        integer customer_id FK "UNIQUE"
        text sophos_customer_id "UNIQUE - externe Kunden-ID"
        text name
        text created_at
        text updated_at
    }

    SOPHOS_DEVICES {
        integer id PK
        integer sophos_customer_id FK
        text product_id FK
        text external_device_id "externe Sophos Device ID"
        text name
        text current_version
        text created_at
        text updated_at
    }

    CUSTOMERS ||--o{ NINJAONE_CUSTOMERS : "hat 0..1"
    CUSTOMERS ||--o{ UNIFI_CUSTOMERS : "hat 0..1"
    CUSTOMERS ||--o{ SOPHOS_CUSTOMERS : "hat 0..1"

    NINJAONE_CUSTOMERS ||--o{ NINJAONE_DEVICES : "hat 1..*"
    UNIFI_CUSTOMERS ||--o{ UNIFI_DEVICES : "hat 1..*"
    SOPHOS_CUSTOMERS ||--o{ SOPHOS_DEVICES : "hat 1..*"

    PRODUCTS ||--o{ PRODUCT_VERSIONS : "hat 1..*"
    PRODUCTS ||--o{ NINJAONE_DEVICES : "ist_in"
    PRODUCTS ||--o{ UNIFI_DEVICES : "ist_in"
    PRODUCTS ||--o{ SOPHOS_DEVICES : "ist_in"
```

## Architektur-Übersicht

### Zentrale Tabellen
| Tabelle | Zweck | Besonderheit |
|---------|-------|-------------|
| **CUSTOMERS** | Zentrale Kundenbasis | 1:1 Zuordnung zu Software-Accounts |
| **PRODUCTS** | Produktkatalog | Einzigartig pro Typ/Quelle |
| **PRODUCT_VERSIONS** | Versionshistorie | Mehrere Quellen pro Produkt möglich |
| **SETTINGS** | Konfiguration | Keine Secrets (nur Runtime-Settings) |

### Pro-Software Integration (3 Schnittstellen)

#### NinjaOne
```
NINJAONE_CUSTOMERS (externe Org-ID)
    ↓
NINJAONE_DEVICES (Geräte von NinjaOne API)
    ↓
products: synology-dsm, sophos-firewall, teamviewer, proxmox-ve, etc.
```

#### Unifi
```
UNIFI_CUSTOMERS (externe Customer-ID)
    ↓
UNIFI_DEVICES (Geräte von Unifi API)
    ↓
products: unifi-network, unifi-os
```

#### Sophos
```
SOPHOS_CUSTOMERS (externe Kunden-ID)
    ↓
SOPHOS_DEVICES (Geräte von Sophos API)
    ↓
products: sophos-firewall (optional: weitere Sophos-Produkte)
```

## Datenfluss

```
┌─────────────────────────────────────────────────────────────┐
│                    DATENQUELLEN                             │
├─────────────────────────────────────────────────────────────┤
│ • NinjaOne API → NINJAONE_DEVICES                           │
│ • Unifi API → UNIFI_DEVICES                                 │
│ • Sophos API → SOPHOS_DEVICES                               │
│ • Web Scraper → PRODUCT_VERSIONS (source='scraped')         │
└─────────────────────────────────────────────────────────────┘
                          ↓
            Speichern in PRODUCT_VERSIONS
            (mit Quelle: scraped|ninjaone|unifi|sophos)
                          ↓
              COMPARATOR: Vergleiche
              aktuelle_version vs. latest_version
                          ↓
             NOTIFIER: Benachrichtigungen
        (Webhook, Slack, Console, etc.)
```

## Wichtige Eigenschaften

✅ **Saubere Trennung:** Jede Software hat eigene Customer/Device-Tabellen  
✅ **Einheitliche Produkte:** Ein Produkt kann von mehreren Quellen kommen  
✅ **Versionsverlauf:** product_versions mit Quelltracking  
✅ **Keine Redundanz:** Keine connector_customers/devices mehr  
✅ **Skalierbar:** Neue Softwares leicht hinzufügbar (copy-paste-pattern)

## Beispiel-Datenfluss

### Kunde: Mustermann GmbH (customer_id=1)

```
CUSTOMERS[1]
├─ NINJAONE_CUSTOMERS[1]
│  └─ NINJAONE_DEVICES
│     ├─ NAS-01 → synology-dsm:7.1.1
│     ├─ FW-01 → sophos-firewall:19.5.3
│     └─ TV-01 → teamviewer:15.51.6
│
├─ UNIFI_CUSTOMERS[1]
│  └─ UNIFI_DEVICES
│     └─ UNIFI-01 → unifi-network:7.5.187
│
└─ SOPHOS_CUSTOMERS: null (noch nicht konfiguriert)

PRODUCTS
├─ synology-dsm
│  └─ PRODUCT_VERSIONS[source=scraped] → 7.3.2
├─ sophos-firewall
│  ├─ PRODUCT_VERSIONS[source=scraped] → 22.0 MR1
│  └─ PRODUCT_VERSIONS[source=sophos] → 22.0.1
└─ ...
```
