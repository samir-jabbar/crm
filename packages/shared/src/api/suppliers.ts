import { z } from 'zod';
import { nameSchema, optionalEmail, optionalText } from './common';

const supplierFields = {
  name: nameSchema,
  company: optionalText(120),
  contactPerson: optionalText(80),
  phone: optionalText(40),
  wechat: optionalText(60),
  email: optionalEmail,
  city: optionalText(80),
  country: optionalText(80),
  notes: optionalText(2000),
};

export const createSupplierRequestSchema = z.strictObject(supplierFields);
export type CreateSupplierRequest = z.input<typeof createSupplierRequestSchema>;

export const updateSupplierRequestSchema = z.strictObject({ ...supplierFields, name: nameSchema.optional() });
export type UpdateSupplierRequest = z.input<typeof updateSupplierRequestSchema>;

export interface Supplier {
  id: string;
  name: string;
  company: string | null;
  contactPerson: string | null;
  phone: string | null;
  wechat: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
