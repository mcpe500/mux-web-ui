// Public API for the integrator (windowStore/DesktopCanvas registration later).
export { PdfViewerView, fileUrl, type PdfViewerViewProps } from './PdfViewerView';
export {
  DOC_MAX_BYTES,
  DOC_WARN_BYTES,
  DocTooLargeError,
  fetchPdfWithCap,
  outlineFlatten,
  pdfRouteDecision,
  readDocMaxBytes,
  searchPlan,
} from './pdfLogic';
export { loadPdfjs, resetPdfjsLoaderForTest } from './pdfLoader';
