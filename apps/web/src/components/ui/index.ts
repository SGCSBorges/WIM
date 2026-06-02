/**
 * Design-system primitives barrel. Import from "@/components/ui" (or the
 * relative path) so route code pulls Button/Field/Card/etc. from one place.
 */
export { Button, buttonClasses } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { Field, Input, Textarea, Select } from "./Field";
export type { FieldProps } from "./Field";
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";
export { Card, Section } from "./Card";
export type { CardProps, SectionProps } from "./Card";
export { Stat } from "./Stat";
export type { StatProps, StatTone } from "./Stat";
export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";
export { Tabs } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";
export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";
export { Pagination } from "./Pagination";
export type { PaginationProps } from "./Pagination";
export { Segmented } from "./Segmented";
export type { SegmentedOption, SegmentedProps } from "./Segmented";
export { Breadcrumbs } from "./Breadcrumbs";
export type { Crumb } from "./Breadcrumbs";
