import axios from "axios";
import { ProdutoUrlRepository } from "../repository/produtoUrlRepository.js";
import { logService } from "../services/logService.js";
import { systemService } from "../services/systemService.js";

// ID da planilha Google Sheets
const SHEET_ID = "1rP5nUcg3KxU23sYGe4Xois4C6KEW4VS-gp-N2Cx5jYY";

// URL para exportar como CSV
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

/**
 * Função para converter CSV em array de objetos
 * @param {string} csvText - Texto do CSV
 * @returns {Array} Array de objetos com os dados
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length === 0) return [];

  // Pegar cabeçalhos
  const headers = parseCSVLine(lines[0]);

  // Converter linhas em objetos
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      data.push(row);
    }
  }
  return data;
}

/**
 * Função para processar linha CSV (lidando com aspas e vírgulas)
 * @param {string} line - Linha do CSV
 * @returns {Array} Array com valores processados
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Busca todos os dados da planilha Google Sheets
 * @returns {Object} { success, total, data, error }
 */
async function buscarTodosDados() {
  try {
    const response = await axios.get(CSV_URL, { timeout: 30000 });
    const data = parseCSV(response.data);

    await logService.saveLog({
      tipo: "ProdutoUrl",
      acao: "buscarTodosDados",
      mensagem: `Buscados ${data.length} registros da planilha`,
      status: "sucesso",
    });

    return {
      success: true,
      total: data.length,
      data: data,
    };
  } catch (error) {
    await logService.saveLog({
      tipo: "ProdutoUrl",
      acao: "buscarTodosDados",
      mensagem: `Erro ao buscar dados: ${error.message}`,
      status: "erro",
      error: error.message,
    });

    return {
      success: false,
      error: "Erro ao buscar dados da planilha",
      details: error.message,
    };
  }
}

/**
 * Atualiza as URLs dos produtos automaticamente a partir da planilha
 * Utiliza deleteMany + insertMany para melhor performance
 * @param {string} id_tenant - ID do tenant
 * @param {Object} options - Opções de atualização (não utilizado, colunas são fixas)
 * @returns {Object} { success, updated, errors, totalProcessados }
 */
async function atualizarUrlsProdutosAutomaticamente(
  id_tenant = null,
  options = {},
) {
  try {
    const campoSku = "Variant SKU";
    const campoUrl = "Variant Image";

    console.log(
      `[ProdutoUrl] Iniciando atualização de URLs para tenant: ${id_tenant}`,
    );

    // Buscar dados da planilha
    const resultado = await buscarTodosDados();
    if (!resultado.success) {
      throw new Error(resultado.details);
    }

    const dados = resultado.data;
    const produtoUrlRepository = new ProdutoUrlRepository(id_tenant);

    let errors = [];
    let totalProcessados = dados.length;
    const registrosParaInserir = [];

    // Passo 1: Acumular todos os registros em um array
    console.log(`[ProdutoUrl] Processando ${totalProcessados} registros...`);
    for (let idx = 0; idx < dados.length; idx++) {
      try {
        const item = dados[idx];
        const originalRow = idx + 1;

        const skuValue = item[campoSku];
        const imageUrl = item[campoUrl];

        if (!skuValue || !imageUrl) {
          errors.push({
            original_row: originalRow,
            motivo: `SKU ou URL vazio`,
            dados: item,
          });
          continue;
        }

        // Estrutura de dados conforme solicitado
        const produtoData = {
          variant_sku: String(skuValue),
          variant_image: String(imageUrl),
          id_tenant: id_tenant,
          created_at: new Date(),
          original_row: originalRow,
        };

        registrosParaInserir.push(produtoData);
      } catch (error) {
        errors.push({
          original_row: idx + 1,
          variant_sku: item[campoSku],
          motivo: error.message,
        });
      }
    }

    const updated = registrosParaInserir.length;

    // Passo 2: Deletar registros existentes
    console.log(
      `[ProdutoUrl] Deletando registros antigos do tenant ${id_tenant}...`,
    );
    await produtoUrlRepository.deleteMany({ id_tenant: id_tenant });

    // Passo 3: Pausa de 20 segundos
    console.log(`[ProdutoUrl] Aguardando 20 segundos antes de inserir...`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 20));

    // Passo 4: Inserir todos os registros de uma vez
    if (registrosParaInserir.length > 0) {
      console.log(
        `[ProdutoUrl] Inserindo ${registrosParaInserir.length} registros...`,
      );
      await produtoUrlRepository.insertMany(registrosParaInserir);
    }

    await logService.saveLog({
      tipo: "ProdutoUrl",
      acao: "atualizarUrlsProdutosAutomaticamente",
      id_tenant: id_tenant,
      updated: updated,
      totalProcessados: totalProcessados,
      errors: errors.length,
      status: "concluido",
    });

    console.log(
      `[ProdutoUrl] Atualização concluída: ${updated}/${totalProcessados} produtos atualizados`,
    );

    return {
      success: true,
      updated: updated,
      errors: errors,
      totalProcessados: totalProcessados,
    };
  } catch (error) {
    await logService.saveLog({
      tipo: "ProdutoUrl",
      acao: "atualizarUrlsProdutosAutomaticamente",
      id_tenant: id_tenant,
      mensagem: `Erro na atualização automática: ${error.message}`,
      status: "erro",
      error: error.message,
    });

    return {
      success: false,
      error: `Erro ao atualizar URLs: ${error.message}`,
      updated: 0,
      errors: [{ motivo: error.message }],
      totalProcessados: 0,
    };
  }
}

/**
 * Valida a conexão com a planilha Google Sheets
 * @returns {Object} { success, message }
 */
async function validarConexaoPlanilha() {
  try {
    const response = await axios.head(CSV_URL, { timeout: 10000 });
    return {
      success: true,
      message: "Conexão com a planilha validada com sucesso",
    };
  } catch (error) {
    return {
      success: false,
      message: "Erro ao conectar à planilha",
      error: error.message,
    };
  }
}

/**
 * Inicializa o controller e suas rotinas
 */
async function init() {
  let key = "produto_url_atualizacao_automatica";
  let id_tenant = 1; // Substituir pelo ID do tenant real, se necessário

  // Verificar se o serviço já foi executado hoje para evitar execuções múltiplas
  if ((await systemService.started(id_tenant, key)) == 1) {
    return;
  }

  // Validar conexão com a planilha ao iniciar
  const validacao = await validarConexaoPlanilha();
  if (validacao.success) {
    console.log(
      "[ProdutoUrl] Controller inicializado com sucesso - Planilha acessível",
    );
    try {
      await atualizarUrlsProdutosAutomaticamente(id_tenant);
    } catch (error) {}
  } else {
    console.error(
      "[ProdutoUrl] Aviso: Não foi possível acessar a planilha - ",
      validacao.error,
    );
  }
}

const produtoUrlController = {
  init,
  parseCSV,
  parseCSVLine,
  buscarTodosDados,
  atualizarUrlsProdutosAutomaticamente,
  validarConexaoPlanilha,
};

export { produtoUrlController };
