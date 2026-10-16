// Company is the user-facing product object. The existing business module
// remains the storage/query implementation while the transition is in flight;
// both routes render the same component and therefore cannot diverge.
export { BusinessPage as CompanyPage } from "../business/components/business-page";
