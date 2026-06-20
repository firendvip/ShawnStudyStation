import { z } from 'zod'

export const MAX_TEXT_LENGTH = 50
export const MAX_BATCH = 100

export const addEntriesSchema = z.object({
  texts: z
    .array(z.string().trim().min(1).max(MAX_TEXT_LENGTH))
    .min(1, '至少输入一个字词')
    .max(MAX_BATCH, `一次最多 ${MAX_BATCH} 个`),
  recordDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
    .optional(),
})

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')

export const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号')

export const requestCodeSchema = z.object({ phone: phoneSchema })

export const loginSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{4,8}$/, '验证码格式不正确'),
})

export const settingsSchema = z.object({
  cycleStartDate: dateSchema,
  pinyinFontSize: z.number().int().min(12).max(48),
  answerFontSize: z.number().int().min(12).max(48),
  dateEntryEnabled: z.boolean(),
  printDays: z.number().int().min(1).max(31),
  printColumns: z.number().int().min(1).max(10),
  printFontSize: z.number().int().min(8).max(40),
  printRowGap: z.number().int().min(0).max(60),
  printMargin: z.number().int().min(10).max(80),
  printShowIndex: z.boolean(),
  printShowWriteSpace: z.boolean(),
  printTitle: z.string().trim().max(60),
  printShowTitle: z.boolean(),
  printAppendDate: z.boolean(),
  printShowSubtitle: z.boolean(),
  printEvenDistribute: z.boolean(),
})

export const reportSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  title: z.string().trim().max(60).optional(),
  columns: z.number().int().min(1).max(10).optional(),
  fontSize: z.number().int().min(8).max(40).optional(),
  margin: z.number().int().min(10).max(80).optional(),
  rowGap: z.number().int().min(0).max(60).optional(),
  showIndex: z.boolean().optional(),
  showWriteSpace: z.boolean().optional(),
  showSubtitle: z.boolean().optional(),
  evenDistribute: z.boolean().optional(),
})

export const updateEntrySchema = z.object({
  text: z.string().trim().min(1, '字词不能为空').max(MAX_TEXT_LENGTH),
})

export type AddEntriesInput = z.infer<typeof addEntriesSchema>
