import { z } from "zod";

/**
 * Zod schema for MovEstoque entity validation.
 * Used by MovEstoqueRepository for data validation.
 */
export const movEstoqueSchema = z.object({
  id: z.string().min(1, "ID deve ser preenchido"),
  id_tenant: z.number().int("ID tenant deve ser um inteiro").positive("ID tenant deve ser positivo"),
  cod_produto: z.string().min(1, "Código do produto deve ser preenchido"),
  id_produto: z.string().min(1, "ID do produto deve ser preenchido"),
  tipo: z.enum(["E", "S"], { message: "Tipo deve ser 'E' (entrada) ou 'S' (saida)" }),
  qtd: z.number().positive("Quantidade deve ser positiva"),
  status: z.number().int("Status deve ser um inteiro"),
  observacao: z.string().optional(),
  dt_movto: z.coerce.date().optional(),
});

/**
 * Inferred type from schema for MovEstoque input.
 * @typedef {z.infer<typeof movEstoqueSchema>} MovEstoqueInput
 */