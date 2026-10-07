import { z } from 'zod';
import { booleanQuery, nameSchema, optionalEmail, optionalText } from './common';
import { pageQuerySchema } from './signInHistory';

const customerFields = {
  name: nameSchema,
  company: optionalText(120),
  city: optionalText(80),
  country: optionalText(80),
  phone: optionalText(40),
  email: optionalEmail,
  notes: optionalText(2000),
};

export const createCustomerRequestSchema = z.strictObject({
  ...customerFields,
  /** Save even though a customer with the same name exists (FR-002). */
  confirmDuplicate: z.boolean().optional(),
});
export type CreateCustomerRequest = z.input<typeof createCustomerRequestSchema>;

export const updateCustomerRequestSchema = z.strictObject({ ...customerFields, name: nameSchema.optional() });
export type UpdateCustomerRequest = z.input<typeof updateCustomerRequestSchema>;

export const addressBookQuerySchema = pageQuerySchema.extend({
  q: z.string().max(100).optional(),
  deleted: booleanQuery,
});
export type AddressBookQuery = z.output<typeof addressBookQuerySchema>;

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
