# QR/Barcode Scanning Plan for Equipment Accountability

## Objective

Add QR/barcode scanning to the Equipment Accountability form. Each equipment label contains the device serial number. The application will inspect the serial-number prefix, determine the equipment category, and place the complete serial number in the correct form section automatically.

The scanner must support:

- A phone or tablet camera.
- A USB/Bluetooth barcode scanner acting as a keyboard.
- Manual entry as a fallback.

## Confirmed Serial-Number Routing

Prefix matching will ignore letter casing and surrounding whitespace. The complete scanned serial number will be preserved in the report.

| Serial prefix | Equipment destination |
| --- | --- |
| `SP1` | Capacitance Fuel Sensor (VSP) |
| `S2` | Floater Fuel Sensor (SP) |
| `NR` | Wireless Network Transmitter (NR) |
| `SD` | Working Hours Monitoring Device (SD) |
| `Z` | Wireless Solar Panel with Power Storage Device (Terminal) |

Any serial number that does not match a configured prefix will not be inserted. The user will see a clear “Unknown device code” message and may scan again or enter the serial manually after checking it.

## Floater AM/AR Workflow

An `S2` serial number identifies a Floater Fuel Sensor but does not identify its required form position. After an `S2` code is scanned:

1. Display a required choice: `AM` or `AR`.
2. Do not add the serial until the user chooses a type.
3. Insert the serial into the next available slot for the selected type.
4. Keep AM and AR devices grouped under their assigned floater tank.
5. Increase the floater quantity and create another tank pair when all applicable slots are occupied.

Implementation assumption: `AM` maps to the form’s existing `SP2.0AR(M)` position, and `AR` maps to the existing `SP2.0AR` position. This mapping should be confirmed during implementation.

## User Experience

### Scanner entry point

Add a prominent **Scan Equipment QR / Barcode** button near the top of the Equipment Accountability form.

### Camera scanner

The scanner dialog will:

- Request access to the rear-facing camera.
- Display a live camera preview and scanning guide.
- Accept QR codes and common one-dimensional barcode formats.
- Stop the camera immediately after a successful scan or when the dialog closes.
- Explain how to enable camera permission if access is denied.
- Explain that camera scanning may require HTTPS or localhost.

### Hardware barcode scanner and manual fallback

The dialog will contain a focused text input. USB/Bluetooth barcode readers can type the serial into this input and submit it with Enter. The same field may be used for manual entry when camera scanning is unavailable.

### Successful scan

After a valid scan, the application will:

1. Normalize surrounding whitespace for validation.
2. Determine the destination from the prefix.
3. Check for duplicates.
4. Request AM/AR when the destination is Floater.
5. Fill the next available destination slot.
6. Increase the appropriate quantity when necessary.
7. Scroll to or highlight the populated field.
8. Show a confirmation containing the serial number and equipment category.

The scanner should be ready for another scan with minimal interaction so multiple devices can be entered efficiently.

## Form Integration Rules

### Capacitance (`SP1`)

- Fill the next empty Capacitance serial-number field.
- Increase the Capacitance quantity if all current fields are occupied.

### Floater (`S2`)

- Require an AM/AR choice.
- Place AM and AR serials in their corresponding positions.
- Prefer an incomplete tank pair that is missing the selected type.
- Add a new tank pair only when no appropriate empty position exists.
- Do not automatically fill the tank-assignment name; the user will enter the physical tank.

### Network (`NR`)

- Fill the next empty Network & Telemetry serial-number field.
- Increase the Network quantity if all current fields are occupied.

### Engine monitor (`SD`)

- Fill the next empty Engine Monitoring serial-number field.
- Increase the Engine quantity if all current fields are occupied.
- Do not automatically fill the connected engine/asset field.

### Solar terminal (`Z`)

- Fill the next empty Solar Power serial-number field.
- Increase the Solar quantity if all current fields are occupied.
- Do not automatically fill the installation location.

## Validation and Safety

- Reject an empty scan.
- Compare prefixes case-insensitively.
- Preserve the scanned serial’s original letter casing and internal characters.
- Reject duplicate serials already present anywhere in the current form.
- Reject serials assigned to another saved vessel report.
- Permit an existing report to retain its own serials while it is being updated.
- Prevent a rapidly repeated camera detection from adding the same code twice.
- Do not save or submit the report automatically after scanning.
- Keep manual editing of every populated serial-number field available.

## Technical Approach

1. Create a reusable client-side scanner component.
2. Use the browser camera API and native barcode detection when supported.
3. Keep the hardware-scanner/manual input available in every browser.
4. Centralize prefix classification in a small, testable function.
5. Centralize serial normalization and duplicate detection.
6. Expose a scan callback to the Equipment Accountability page.
7. Reuse the form’s existing state setters so scanned values appear in the live preview and generated reports.
8. Clean up camera tracks and scan timers whenever scanning stops or the component unmounts.

If native browser barcode detection does not provide sufficient device coverage, evaluate a maintained client-side scanning library as a fallback before adding a new dependency.

## Implementation Phases

### Phase 1: Classification and insertion logic

- Implement and test prefix detection.
- Implement unknown-prefix handling.
- Implement next-empty-slot selection.
- Implement quantity expansion.
- Implement floater AM/AR placement and pairing.
- Connect duplicate checks to existing saved-report data.

### Phase 2: Scanner interface

- Build the scanner dialog.
- Add camera lifecycle and permission handling.
- Add hardware-scanner/manual input.
- Add scan success, error, and AM/AR selection states.

### Phase 3: Form integration

- Add the scanner entry point to Equipment Accountability.
- Connect successful scans to the five equipment sections.
- Add field highlighting/scrolling and user feedback.
- Verify that saving, updating, previewing, printing, and generating documents use the scanned values.

### Phase 4: Verification

- Run lint and TypeScript checks.
- Run the existing automated tests.
- Add focused tests for classification and serial insertion logic.
- Test on a phone over HTTPS.
- Test with a USB/Bluetooth barcode reader.
- Test report creation and update flows end to end.

## Acceptance Tests

- Scanning `SP1...` fills Capacitance.
- Scanning `S2...` requires AM or AR before insertion.
- Choosing AM fills the `SP2.0AR(M)`/AM position.
- Choosing AR fills the `SP2.0AR`/AR position.
- Floater scans prefer the missing side of an existing tank pair.
- Scanning `NR...` fills Network & Telemetry.
- Scanning `SD...` fills Engine Monitoring.
- Scanning `Z...` fills Solar Power.
- Lowercase or mixed-case prefixes route correctly.
- An unknown prefix produces an error and changes no form data.
- A duplicate scan produces an error and is not inserted twice.
- A serial already assigned to another vessel is rejected.
- A full destination automatically receives another visible serial slot.
- Camera permission denial leaves hardware/manual entry usable.
- Closing the scanner stops the device camera.
- Scanned serials appear correctly in saved reports, previews, printed output, and generated documents.

## Items to Confirm During Implementation

- Confirm that `AM` is the business name for the current `SP2.0AR(M)` floater position.
- Confirm the exact browsers and devices used in the field.
- Test representative real labels for each prefix to confirm scan reliability and whether any labels include leading or trailing control characters.
