import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    paddingTop: 48,
    paddingBottom: 44,
    paddingHorizontal: 52,
    color: "#1a1a1a",
    lineHeight: 1.55,
  },
  // ── Header ──────────────────────────────────────────
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: "#111111",
  },
  brandText: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    color: "#111111",
  },
  brandSub: {
    fontSize: 7,
    color: "#888888",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  docTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#555555",
    textAlign: "right",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  docSub: {
    fontSize: 7.5,
    color: "#999999",
    textAlign: "right",
    marginTop: 3,
  },
  // ── Meta strip ────────────────────────────────────────
  metaStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
    marginBottom: 18,
    backgroundColor: "#f7f7f7",
    borderLeftWidth: 3,
    borderLeftColor: "#111111",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 2,
  },
  metaItem: {
    flex: 1,
    minWidth: "20%",
    marginRight: 8,
  },
  metaLabel: {
    fontSize: 6.5,
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  // ── AI chip ───────────────────────────────────────────
  aiChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 18,
    gap: 4,
  },
  aiLabel: {
    fontSize: 7,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: "Helvetica-Bold",
  },
  aiValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  aiDot: {
    fontSize: 7,
    color: "#999",
    marginHorizontal: 4,
  },
  // ── Sections ─────────────────────────────────────────
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#444444",
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
  },
  sectionBody: {
    fontSize: 9.5,
    color: "#1a1a1a",
    lineHeight: 1.65,
  },
  // ── Signature ────────────────────────────────────────
  signatureBlock: {
    marginTop: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#111111",
    maxWidth: 220,
  },
  sigName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  sigCredentials: {
    fontSize: 8.5,
    color: "#555555",
    marginTop: 2,
  },
  sigDate: {
    fontSize: 8,
    color: "#888888",
    marginTop: 5,
  },
  // ── Footer ───────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 20,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 7,
    borderTopWidth: 0.5,
    borderTopColor: "#cccccc",
  },
  footerText: {
    fontSize: 6.5,
    color: "#aaaaaa",
  },
});

export interface ReportPDFProps {
  patientName: string;
  patientId?: string;
  studyDate: string;
  signedDate: string;
  studyId: string;
  content: {
    background_activity?: string;
    sleep_architecture?: string;
    abnormalities?: string;
    impression?: string;
    recommendations?: string;
    clinical_correlates?: string;
  };
  interpreterName?: string;
  interpreterCredentials?: string;
  aiClassification?: string;
  aiConfidence?: number;
}

const SECTIONS: { key: keyof ReportPDFProps["content"]; title: string }[] = [
  { key: "background_activity",  title: "Background Activity" },
  { key: "sleep_architecture",   title: "Sleep Architecture" },
  { key: "abnormalities",        title: "Abnormalities & Epileptiform Activity" },
  { key: "impression",           title: "Impression & Interpretation" },
  { key: "clinical_correlates",  title: "Clinical Correlates" },
  { key: "recommendations",      title: "Recommendations" },
];

export function ReportDocument({
  patientName,
  patientId,
  studyDate,
  signedDate,
  studyId,
  content,
  interpreterName,
  interpreterCredentials,
  aiClassification,
  aiConfidence,
}: ReportPDFProps) {
  const showAI = !!aiClassification && aiClassification !== "unknown" && aiClassification !== "inconclusive";
  const aiLabel = showAI
    ? aiClassification!.charAt(0).toUpperCase() + aiClassification!.slice(1)
    : null;

  return (
    <Document
      title={`EEG Report — ${patientName}`}
      author={interpreterName || "ENCEPHLIAN™"}
      creator="ENCEPHLIAN™ Platform"
      subject="EEG Interpretation Report"
    >
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.brandText}>ENCEPHLIAN™</Text>
            <Text style={styles.brandSub}>Clinical EEG Platform</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>EEG Interpretation Report</Text>
            <Text style={styles.docSub}>IFCN · SCORE format</Text>
          </View>
        </View>

        {/* ── Patient / study meta ── */}
        <View style={styles.metaStrip}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Patient</Text>
            <Text style={styles.metaValue}>{patientName}</Text>
          </View>
          {patientId && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Patient ID</Text>
              <Text style={styles.metaValue}>{patientId}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Study Date</Text>
            <Text style={styles.metaValue}>{studyDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Report Signed</Text>
            <Text style={styles.metaValue}>{signedDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Study ID</Text>
            <Text style={styles.metaValue}>{studyId.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>

        {/* ── AI classification chip ── */}
        {showAI && (
          <View style={styles.aiChip}>
            <Text style={styles.aiLabel}>Classification</Text>
            <Text style={styles.aiDot}>·</Text>
            <Text style={styles.aiValue}>{aiLabel}</Text>
            {typeof aiConfidence === "number" && aiConfidence >= 0.65 && (
              <>
                <Text style={styles.aiDot}>·</Text>
                <Text style={[styles.aiLabel, { color: "#888" }]}>
                  {Math.round(aiConfidence * 100)}% confidence
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── Report sections ── */}
        {SECTIONS.map(({ key, title }) => {
          const text = content[key];
          if (!text?.trim()) return null;
          return (
            <View key={key} style={styles.section}>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.sectionBody}>{text}</Text>
            </View>
          );
        })}

        {/* ── Signature block ── */}
        <View style={styles.signatureBlock}>
          <Text style={styles.sigName}>{interpreterName || "Interpreting Physician"}</Text>
          {interpreterCredentials ? (
            <Text style={styles.sigCredentials}>{interpreterCredentials}</Text>
          ) : null}
          <Text style={styles.sigDate}>Digitally signed: {signedDate}</Text>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            ENCEPHLIAN™ — For physician review only. Not for direct patient distribution.
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
