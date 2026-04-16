import { TransferenciaRepository } from "../repository/transferenciaRepository.js";
import { TransferenciaFilaRepository } from "../repository/transferenciaFilaRepository.js";
import { TransferenciaMovtoRepository } from "../repository/transferenciaMovtoRepository.js";
import { ProdutoTinyRepository } from "../repository/produtoTinyRepository.js";
import { MpkIntegracaoRepository } from "../repository/mpkIntegracaoRepository.js";
import { MovEstoqueRepository } from "../repository/movEstoqueRepository.js";

import { estoqueController } from "./estoqueController.js";

import { TMongo } from "../infra/mongoClient.js";
import { lib } from "../utils/lib.js";

const STATUS_CONFIRMADO = "Confirmado";
const STATUS_CONCLUIDO = "Concluido";
const STATUS_PENDENTE = "Pendente";
const STATUS_ERRO = "Erro";
const SUB_STATUS_PROCESSANDO = "Processando";
const SUB_STATUS_PROCESSADO_ESTOQUE = "Processado_estoque";
const SUB_STATUS_PROCESSANDO_PARCIAL = "Processando_parcial";

// Status codes for tmp_mov_estoque processing (numeric)
const STATUS_MOV_SUCESSO = 10;
const STATUS_MOV_ERRO = 500;

// Variável global para armazenar as transferências processadas
let listaTransferencias = [];
let ultimaDataVerificacao = new Date().toDateString();

function verificarMudancaDia() {
  const dataAtual = new Date().toDateString();
  console.log(
    `Verificando mudança de dia: ${dataAtual} - Última verificação: ${ultimaDataVerificacao}`,
  );

  if (dataAtual !== ultimaDataVerificacao) {
    console.log(
      `Dia mudou de ${ultimaDataVerificacao} para ${dataAtual} - Zerando lista de transferências`,
    );
    listaTransferencias = [];
    ultimaDataVerificacao = dataAtual;
    return true;
  }

  return false;
}

async function init() {
  verificarMudancaDia();
  try {
    for (const status of [STATUS_PENDENTE, STATUS_CONFIRMADO]) {
      await processarTransferenciaByStatus(status);
    }
    await retificarTransferencias();
  } finally {
    await processarEstoque();
  }
}

async function processarTransferenciaByStatus(status = STATUS_CONFIRMADO) {
  const c = await TMongo.connect();
  let repository = new TransferenciaRepository(c);
  let mpkIntegracao = new MpkIntegracaoRepository(c);
  let empresas = await mpkIntegracao.findAll({});

  //Busco o id do produto no tiny e atualizo no item da transferencia
  for (let empresa of empresas) {
    let rows = await repository.findAll({
      status: status,
      to_id_company: empresa.id,
    });

    if (!Array.isArray(rows) && rows.length <= 0) continue;
    let produto = new ProdutoTinyRepository(c, empresa.id);
    let nao_conformidade = 0;

    for (const row of rows) {
      // Se STATUS_PENDENTE já foi processado (sub_status = PROCESSANDO_PARCIAL), skip
      if (
        status === STATUS_PENDENTE &&
        row?.sub_status === SUB_STATUS_PROCESSANDO_PARCIAL
      ) {
        console.log(`Transferência Pendente já processada: ${row.id}`);
        continue;
      }

      let items = row.items;
      let movEstoqueRecords = [];
      let movEstoqueRepo = new MovEstoqueRepository(row.from_id_company);
      let nao_achou_produto = 0;
      for (const item of items) {
        let item_nao_conformidade = 0;
        let produto_tiny_loja_destino = null;

        try {
          produto_tiny_loja_destino = await produto.findByCodigo(item?.code);
        } catch (error) {
          console.log(`Erro ao buscar produto: ${item.code}`, error);
        }

        if (
          !produto_tiny_loja_destino ||
          produto_tiny_loja_destino == null ||
          produto_tiny_loja_destino == undefined
        ) {
          console.log(`Produto não encontrado: ${item.code}`);
          nao_achou_produto = 1;
          continue;
        }

        if (item.quantity !== item.qtd_original) {
          nao_conformidade = 1;
          item_nao_conformidade = 1;
        }
        item.to_id_product = produto_tiny_loja_destino?.id;
        if (!item.id_entrada || item?.id_entrada == null)
          item.id_entrada = await lib.newUUId();
        if (!item.id_saida || item?.id_saida == null)
          item.id_saida = await lib.newUUId();
        item.nao_conformidade = item_nao_conformidade;

        // Validar se registro já existe (duplicado)
        const existingRecord = await movEstoqueRepo.findById(item.id_saida);
        if (existingRecord) {
          console.log(`MovEstoque já existe: ${item.id_saida}`);
          continue;
        }

        movEstoqueRecords.push({
          id: item.id_saida,
          id_tenant: item.from_id_company,
          id_transferencia: row.id,
          cod_produto: item.code,
          id_produto: item.from_id_product,
          tipo: "S",
          qtd: item.qtd_original, // Usar quantidade original para estoque de saida ( motivo : eh processado antes )
          status: 1,
          observacao: row?.to_company || "",
          dt_movto: new Date(),
        });
      } // for item

      //disparar um log de erro se nao achou produto
      if (nao_achou_produto > 0) {
        console.error(
          `Erro: Produto não encontrado para a transferência: ${row.id}`,
        );
        //continue;
      }

      row.sub_status =
        status === STATUS_PENDENTE
          ? SUB_STATUS_PROCESSANDO_PARCIAL
          : SUB_STATUS_PROCESSANDO;
      row.nao_conformidade = nao_conformidade;
      await repository.update(row.id, row);

      if (status === STATUS_PENDENTE && movEstoqueRecords.length > 0) {
        await movEstoqueRepo.insertMany(movEstoqueRecords);
      }
    }
  }
}

async function acharNovoIdProduto({
  c,
  id_tenant,
  cod_produto,
  id_produto_tiny,
}) {
  console.log(`Movimento não encontrado: ${cod_produto}`);
  let result = null;
  const produto = new ProdutoTinyRepository(c, id_tenant);

  let prods = await produto.findAll({
    codigo: cod_produto,
    id_tenant: id_tenant,
  });
  if (!Array.isArray(prods) || prods.length <= 0) {
    console.log("Nenhum produto encontrado para o código: ", cod_produto);
    return result;
  }

  //achar o novo codigo do produto no tiny na empresa correta
  for (let p of prods) {
    if (
      p.id == id_produto_tiny &&
      p.codigo == cod_produto &&
      prods.length > 1
    ) {
      //excluindo o produto duplicado invalido   04-12-2025
      console.log("Excluindo produto duplicado: ", p.id);
      await produto.delete(p.id);
      continue;
    }

    if (p.codigo == cod_produto) {
      result = p.id;
      break;
    }
  }

  return result;
}

async function retificarTransferencias() {
  const c = await TMongo.connect();
  const transferenciaMovto = new TransferenciaMovtoRepository(c);
  let repository = new TransferenciaRepository(c);

  //aplicar a logica correcao se tiver campo nao_validado = 1
  let rows = await repository.findAll({
    status: STATUS_CONFIRMADO,
    sub_status: SUB_STATUS_PROCESSANDO,
    nao_validado: 1,
  });

  if (!Array.isArray(rows) || rows.length <= 0) {
    console.log("Nenhuma transferencia para retificar");
    return;
  }

  let updateCount = 0;
  for (const row of rows) {
    console.log(`Transferência ID: ${row.id}`);
    updateCount = 0;
    let new_id = null;

    for (const item of row?.items) {
      console.log("Retificando item: ", item);
      let new_id = null;
      if (!item?.id_entrada || !item?.id_saida) {
        console.log(
          `Faltando IDs na transferência ${row.id} para o item ${item?.code}`,
        );
        continue;
      }

      let saida = await transferenciaMovto.findById(item?.id_saida);
      let entrada = await transferenciaMovto.findById(item?.id_entrada);

      if (!saida) {
        //item.from_id_product
        new_id = await acharNovoIdProduto({
          c,
          id_tenant: row.from_id_company,
          cod_produto: item?.code,
          id_produto_tiny: item?.from_id_product,
        });

        if (new_id) {
          item.from_id_product = new_id;
          updateCount++;
        }
      }

      if (!entrada) {
        new_id = await acharNovoIdProduto({
          c,
          id_tenant: row.to_id_company,
          cod_produto: item?.code,
          id_produto_tiny: item?.to_id_product,
        });
        if (new_id) {
          item.to_id_product = new_id;
          updateCount++;
        }
      }
    }

    if (updateCount > 0) {
      row.nao_validado = 0;
      console.log("Atualizando transferência: ", row.id);
      await repository.update(row.id, row);
    }
  }
}

async function processarEstoque() {
  const c = await TMongo.connect();
  const transferenciaMovto = new TransferenciaMovtoRepository(c);
  const fila = new TransferenciaFilaRepository(c);
  let repository = new TransferenciaRepository(c);
  let mpkIntegracao = new MpkIntegracaoRepository(c);
  let empresas = await mpkIntegracao.findAll({});
  let empresa_from = null;
  let empresa_to = null;
  let item_code = null;
  let cod_transf = null;

  let rows = await repository.findAll({
    status: STATUS_CONFIRMADO,
    sub_status: SUB_STATUS_PROCESSANDO,
  });

  if (!Array.isArray(rows) || rows.length <= 0) {
    console.log("Nenhuma transferencia para processar");
    return;
  }

  let retorno = [];
  for (const row of rows) {
    let items = row.items || [];
    empresa_from = null;
    empresa_to = null;
    cod_transf = row?.id;
    let doc = row?.id;
    let obj = await fila.findById(cod_transf);

    if (obj) {
      console.log(`Transferencia já processada: ${cod_transf}`);
      continue;
    }

    if (listaTransferencias.includes(cod_transf)) {
      console.log(`Transferencia já processada: ${cod_transf}`);
      continue;
    }

    if (!listaTransferencias.includes(cod_transf)) {
      listaTransferencias.push(cod_transf);
    }

    //localizar a empresa de origem , tive problemas o find não funcionou
    for (let e of empresas) {
      if (e.id == row.from_id_company) {
        empresa_from = e;
      }

      if (e.id == row.to_id_company) {
        empresa_to = e;
      }
    }

    if (!empresa_from || !empresa_to) {
      console.log("Empresa não encontrada");
      continue;
    }

    let nao_validado = 0;
    for (const item of items) {
      if (!item?.id_entrada || !item?.id_saida) {
        nao_validado = 1;
        console.log(
          `Transferencia não validada, falta id_entrada ou id_saida: ${item?.code}`,
        );
        continue;
      }
      item_code = item?.code;
      let saida = await transferenciaMovto.findById(item?.id_saida);
      let entrada = await transferenciaMovto.findById(item?.id_entrada);
      let status = STATUS_CONCLUIDO;

      //******************************************************************************************* */
      if (saida) {
        console.log(`Movimento já existe: ${item?.id_saida}`);
      } else {
        let ts = null;
        ts = await estoqueController.transferir(
          empresa_from.token,
          item.from_id_product,
          item.quantity,
          "S",
          row.to_company,
          doc,
        );

        if (!ts || ts == null) {
          nao_validado = 1;
          console.log(`Erro ao transferir produto: ${item.code}`);
          retorno.push({
            id_produto: item_code,
            interno_tiny: item.from_id_product,
            doc_transf: doc,
            origem: empresa_from.codigo,
            tipo: "Saida",
            status: "Erro",
          });
        }

        if (ts) {
          await transferenciaMovto.create({
            id: item?.id_saida,
            id_produto: item_code,
            id_transferencia: cod_transf,
            status: "Concluido",
            tipo: "S",
            response: ts,
            created_at: new Date(),
          });
        }
      }
      //******************************************************************************************* */
      if (entrada) {
        console.log(`Movimento já existe: ${item?.id_entrada}`);
      } else {
        let te = null;
        te = await estoqueController.transferir(
          empresa_to.token,
          item.to_id_product,
          item.quantity,
          "E",
          row.from_company,
          doc,
        );

        if (!te || te == null) {
          nao_validado = 1;
          console.log(`Erro ao transferir produto: ${item.code}`);
          retorno.push({
            id_produto: item_code,
            interno_tiny: item.to_id_product,
            doc_transf: doc,
            origem: empresa_to.codigo,
            tipo: "Entrada",
            status: "Erro",
          });
        }

        if (te) {
          await transferenciaMovto.create({
            id: item?.id_entrada,
            id_produto: item_code,
            id_transferencia: cod_transf,
            status: "Concluido",
            tipo: "E",
            response: te,
            created_at: new Date(),
          });
        }
      }
      //******************************************************************************************* */
      item.status = status;
    } //for items

    //disparar um log de erro se nao achou produto
    if (nao_validado > 0) {
      console.log(`Transferencia não validada: ${cod_transf}`);
      //sinalizo para reprocessar e corrigir o campo
      await repository.update(row.id, { nao_validado: 1 });
      continue;
    }

    //estava enviando para atualizar todo objeto
    row.sub_status = SUB_STATUS_PROCESSADO_ESTOQUE;
    row.status = STATUS_CONCLUIDO;

    let res = await repository.update(row.id, {
      status: STATUS_CONCLUIDO,
      sub_status: SUB_STATUS_PROCESSADO_ESTOQUE,
    });
    //console.log(res);
    if (res?.modifiedCount > 0) {
      await fila.create({ id: cod_transf, created_at: new Date() });
    }

    if (listaTransferencias.length > 100) {
      listaTransferencias.shift(); // Limitar o tamanho da lista para evitar consumo excessivo de memória
    }
  }
}

/**
 * Process pending stock decrease records from tmp_mov_estoque collection.
 * Validates duplicates via TransferenciaMovtoRepository.findById(),
 * processes via estoqueController.transferir(), and records results.
 *
 * @returns {Promise<void>}
 */
async function baixarEstoqueTmpMovEstoque() {
  const c = await TMongo.connect();
  const transferenciaMovto = new TransferenciaMovtoRepository(c);
  const mpkIntegracao = new MpkIntegracaoRepository(c);

  const empresas = await mpkIntegracao.findAll({});

  if (!Array.isArray(empresas) || empresas.length <= 0) {
    console.log("Nenhum tenant encontrado para processar");
    return;
  }

  for (const empresa of empresas) {
    // Skip tenant if missing token
    if (!empresa.token) {
      console.log(`Tenant ${empresa.id} sem token - ignorando`);
      continue;
    }

    // Create MovEstoqueRepository with tenant filtering
    const movEstoqueRepo = new MovEstoqueRepository(empresa.id);
    const pendingRecords = await movEstoqueRepo.findAll({
      status: 1,
      id_tenant: empresa.id,
    });

    if (!Array.isArray(pendingRecords) || pendingRecords.length <= 0) {
      continue;
    }

    console.log(
      `Processando ${pendingRecords.length} registros pendentes para tenant ${empresa.id}`,
    );

    for (const record of pendingRecords) {
      try {
        // Check for duplicate in transferencia_movto
        const existingRecord = await transferenciaMovto.findById(record.id);

        if (existingRecord) {
          console.log(`Registro duplicado encontrado: ${record.id}`);
          await movEstoqueRepo.update(record.id, { status: STATUS_MOV_ERRO });
          continue;
        }

        // Process stock decrease via Tiny ERP
        const result = await estoqueController.transferir(
          empresa.token,
          record.id_produto,
          record.qtd,
          record.tipo,
          record.observacao || "",
          record.id_transferencia,
        );

        if (!result || result === null) {
          console.log(
            `Erro ao processar registro ${record.id} - produto ${record.id_produto}`,
          );
          await movEstoqueRepo.update(record.id, { status: STATUS_MOV_ERRO });
          continue;
        }

        // Record success in transferencia_movto
        await transferenciaMovto.create({
          id: record.id,
          id_produto: record.cod_produto,
          id_transferencia: record.id_transferencia || null,
          status: STATUS_CONCLUIDO,
          tipo: record.tipo,
          response: result,
          created_at: new Date(),
        });

        // Update original record status to success
        await movEstoqueRepo.update(record.id, { status: STATUS_MOV_SUCESSO });
        console.log(`Registro processado com sucesso: ${record.id}`);
      } catch (error) {
        console.log(`Erro no processamento do registro ${record.id}:`, error);
        await movEstoqueRepo.update(record.id, { status: STATUS_MOV_ERRO });
      }
    }
  }
}

async function auditoriaTransferencias() {
  // Esse script foi rodado para corrigir transferências que não tinham os ids de entrada e saída preenchidos. 30-07-2025
  return;

  const c = await TMongo.connect();
  let repository = new TransferenciaRepository(c);
  const fila = new TransferenciaFilaRepository(c);
  const transferenciaMovto = new TransferenciaMovtoRepository(c);

  let rows = await repository.findAll({
    status: STATUS_CONCLUIDO,
    sub_status: SUB_STATUS_PROCESSADO_ESTOQUE,
  });

  if (!Array.isArray(rows) || rows.length <= 0) {
    console.log("Nenhuma transferencia pendente para auditar");
    return;
  }
  const produtos = [];
  let qtd = 0;

  for (const row of rows) {
    let items = row.items;
    let nao_validado = 0;
    let index = 0;
    console.log(`lendo pedido : ${row.id} `);

    for (const item of items) {
      index++;

      if (!item?.id_entrada || !item?.id_saida) {
        produtos.push(item);
        nao_validado = 1;
        console.log(`${row.id} - ${index} - ${item?.code}`);
      }

      let saida = await transferenciaMovto.findById(item?.id_saida);
      let entrada = await transferenciaMovto.findById(item?.id_entrada);

      if (!saida || !entrada) {
        produtos.push(item);
        nao_validado = 1;
        console.log(`${row.id} - ${index} - ${item?.code}`);
      }

      if (nao_validado > 0) {
        break;
      }
    }

    if (nao_validado > 0) {
      qtd++;
      row.status = STATUS_CONFIRMADO;
      console.log("reprocessando transferencia: " + row.id);
      await repository.update(row.id, row);
      await fila.delete(row.id);
      console.log("excluindo fila: " + row.id);
    }
  }
  console.log("total de produtos não validados: " + produtos.length);
}

const transferenciaController = {
  init,
  baixarEstoqueTmpMovEstoque,
};

export { transferenciaController };
