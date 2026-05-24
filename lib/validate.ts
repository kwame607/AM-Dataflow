import { z } from 'zod';

const ghPhone = z
  .string()
  .regex(/^(0|\+233)[2-9]\d{8}$/, 'Invalid Ghanaian phone number');

export const InitializePaymentSchema = z.object({
  email: z.string().email(),
  amount: z.number().int().positive().max(100_000_00),
  reference: z.string().min(8).max(100),
  metadata: z.object({
    network: z.enum(['mtn', 'at', 'airteltigo', 'telecel']),
    bundle_key: z.string().min(1).max(100),
    source: z.enum(['main', 'agent']),
    agent_slug: z.string().max(100).optional(),
    agent_price: z.number().positive().optional(),
    custom_fields: z.array(z.object({
      display_name: z.string(),
      variable_name: z.string(),
      value: z.union([z.string(), z.number()]),
    })).optional(),
  }),
});

export const VerifyPaymentSchema = z.object({
  reference: z.string().min(8).max(100),
  orderData: z.object({
    phone: ghPhone,
    network: z.enum(['mtn', 'at', 'airteltigo', 'telecel']),
    bundleKey: z.string().min(1).max(100),
    source: z.enum(['main', 'agent']),
    agentSlug: z.string().max(100).optional(),
    agentPrice: z.number().positive().optional(),
    adminPrice: z.number().positive().optional(),
  }),
});

export const RetryDeliverySchema = z.object({
  orderId: z.string().uuid(),
});

export const RegisterAgentSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: ghPhone,
  password: z.string().min(6).max(100),
});

export const WithdrawalSchema = z.object({
  amount: z.number().positive().min(20).max(10000),
  momoNumber: ghPhone,
  momoName: z.string().min(2).max(100),
  network: z.enum(['mtn', 'at', 'airteltigo', 'telecel']),
});
