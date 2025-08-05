/**
 * Deprecated module.
 *
 * This file previously contained a duplicate WarrantyService.
 * The canonical service is now `src/modules/warranties/warranty.service.ts`.
 *
 * Keeping this as a re-export avoids breaking any older imports while ensuring
 * scheduling logic remains centralized.
 */

export { WarrantyService } from "../warranties/warranty.service";
