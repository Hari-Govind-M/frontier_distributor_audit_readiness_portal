# Frontier Distributor Audit Readiness Portal

This is a static, browser-only readiness portal for Microsoft consultants and CSP distributors preparing for the Frontier Distributor designation assessment.

## What is included

- `src/index.html` static app entry point
- `src/styles.css` Microsoft-style clean blue design
- `src/data.js` checklist, metric, mock question, evidence, and template data
- `src/app.js` local storage, export/import JSON, score calculation, gap report, mock audit, and regional tracking logic
- `src/staticwebapp.config.json` Azure Static Web Apps configuration
- `frontier-distributor-readiness-portal-single.html` standalone offline version
- `deploy-azure-static-webapps.sh` Cloud Shell deployment helper

## Privacy and storage model

The portal does not upload evidence files. It stores readiness data only in the browser local storage. Users can export their readiness state to JSON and later import it back.

Tracked fields include evidence name, location, owner, readiness status, SME, demo status, and notes. Do not paste confidential customer data into the notes field unless the distributor's policy allows it.

## Local use

Open:

```text
src/index.html
```

or use the standalone file:

```text
frontier-distributor-readiness-portal-single.html
```

## Azure Static Web Apps deployment from Azure Cloud Shell

From the project root:

```bash
chmod +x deploy-azure-static-webapps.sh
./deploy-azure-static-webapps.sh
```

The script creates a resource group and Azure Static Web App, retrieves the deployment token, installs the Static Web Apps CLI if needed, and deploys the `src` folder.

You can override defaults:

```bash
RESOURCE_GROUP=rg-frontier-readiness \
APP_NAME=swa-frontier-readiness \
LOCATION=eastus2 \
./deploy-azure-static-webapps.sh
```

## Build

No build is required. This is a static HTML, CSS, and JavaScript application.

## Readiness status logic

The portal shows `Ready for ISSI Audit` only when:

1. Quantitative score passes at least 33 of 37 metrics.
2. All six required quantitative metrics pass.
3. All non-waived Module 1 mandatory controls are evidence tracked.
4. At least three Module 1 aspirational controls are evidence tracked.
5. All non-waived Module 2 controls are evidence tracked.
6. Required or selected controls have evidence name, owner, and evidence status set to ready.
7. Regional controls are ready for additional CSP regions.
8. Mandatory controls and at least three aspirational controls are marked mock passed.

This tool is a readiness aid. ISSI conducts the assessment and Microsoft makes the final designation decision.
