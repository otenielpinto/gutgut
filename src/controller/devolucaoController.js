import { DevolucaoRepository } from "../repository/devolucaoRepository.js";
import { DevolucaoFilaRepository } from "../repository/devolucaoFilaRepository.js";
import { DevolucaoMovtoRepository } from "../repository/devolucaoMovtoRepository.js";

import { ProdutoTinyRepository } from "../repository/produtoTinyRepository.js";
import { MpkIntegracaoRepository } from "../repository/mpkIntegracaoRepository.js";

import { estoqueController } from "./estoqueController.js";

import { TMongo } from "../infra/mongoClient.js";
import { lib } from "../utils/lib.js";

const STATUS_CONFIRMADO = "Confirmado";
const STATUS_CONCLUIDO = "Concluido";
const STATUS_PENDENTE = "Pendente";
const STATUS_ERRO = "Erro";
const SUB_STATUS_PROCESSANDO = "Processando";
const SUB_STATUS_PROCESSADO_ESTOQUE = "Processado_estoque";

// Definição dos depósitos
const DEPOSITO_GERAL = "Geral";
const DEPOSITO_TROCAS_DEFEITOS = "Trocas/Defeitos";

async function init() {
  await processarDevolucaoConfirmada();
  await processarEstoque();
}

async function processarDevolucaoConfirmada() {
  const c = await TMongo.connect();
  let repository = new DevolucaoRepository(c);
  let mpkIntegracao = new MpkIntegracaoRepository(c);
  let empresas = await mpkIntegracao.findAll({});

  //Busco o id do produto no tiny e atualizo no item da devolucao
  for (let empresa of empresas) {
    let rows = await repository.findAll({
      status: STATUS_CONFIRMADO,
      to_id_company: empresa.id,
    });

    if (!Array.isArray(rows) && rows.length <= 0) continue;
    let produto = new ProdutoTinyRepository(c, empresa.id);
    let nao_conformidade = 0;
    let nao_achou_produto = 0;

    for (const row of rows) {
      nao_achou_produto = 0;
      let items = row.items;
      for (const item of items) {
        let item_nao_conformidade = 0;
        let produto_tiny_loja_destino = null;

        try {
          produto_tiny_loja_destino = await produto.findByCodigo(item?.code);
        } catch (error) {
          nao_achou_produto++;
          console.error(`Error fetching product: ${error.message}`);
        }

        if (!produto_tiny_loja_destino) {
          nao_achou_produto++;
          console.log(`Produto não encontrado: ${item.code}`);
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
      }

      if (nao_achou_produto > 0) {
        console.error(
          `Erro: Produto não encontrado para a devolução: ${row.id}`
        );
        continue;
      }

      row.sub_status = SUB_STATUS_PROCESSANDO;
      row.nao_conformidade = nao_conformidade;
      await repository.update(row.id, row);
    }
  }
  await TMongo.disconnect();
}

async function processarEstoque() {
  const c = await TMongo.connect();
  const devolucaoMovto = new DevolucaoMovtoRepository(c);
  const fila = new DevolucaoFilaRepository(c);
  let repository = new DevolucaoRepository(c);
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
    console.log("Nenhuma devolucao para processar");
    return;
  }

  for (const row of rows) {
    let items = row.items;
    empresa_from = null;
    empresa_to = null;
    cod_transf = row?.id;
    let doc = row?.id;
    let obj = await fila.findById(cod_transf);

    if (obj) {
      console.log(`Devolucao já processada: ${cod_transf}`);
      continue;
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
        console.log(`Item não validado: ${item.code}`);
        continue;
      }
      item_code = item?.code;

      let saida = await devolucaoMovto.findById(item?.id_saida);
      let entrada = await devolucaoMovto.findById(item?.id_entrada);
      let status = STATUS_CONCLUIDO;

      //******************************************************************************************* */
      if (saida) {
        console.log(`Movimento já existe: ${item?.id_saida}`);
      } else {
        let ts = null;
        try {
          ts = await estoqueController.transferir(
            empresa_from.token,
            item.from_id_product,
            item.quantity,
            "S",
            row.to_company,
            doc,
            "SIM",
            null
          );
          if (!ts || ts == null) nao_validado++;

          if (ts) {
            await devolucaoMovto.create({
              id: item?.id_saida,
              id_produto: item_code,
              id_transferencia: cod_transf,
              status: "Concluido",
              tipo: "S",
              response: ts,
              created_at: new Date(),
              deposito: null,
            });
          }
        } catch (error) {
          console.log(`Erro ao atualizar produto: ${item.code}`);
          status = STATUS_ERRO;
        }
      }
      //******************************************************************************************* */
      if (entrada) {
        console.log(`Movimento já existe: ${item?.id_entrada}`);
      } else {
        try {
          let te = null;
          te = await estoqueController.transferir(
            empresa_to.token,
            item.to_id_product,
            item.quantity,
            "E",
            row.from_company,
            doc,
            "SIM",
            DEPOSITO_TROCAS_DEFEITOS
          );
          if (!te || te == null) nao_validado++;

          if (te) {
            await devolucaoMovto.create({
              id: item?.id_entrada,
              id_produto: item_code,
              id_transferencia: cod_transf,
              status: "Concluido",
              tipo: "E",
              response: te,
              created_at: new Date(),
              deposito: DEPOSITO_TROCAS_DEFEITOS,
            });
          }
        } catch (error) {
          console.log(`Erro ao atualizar produto: ${item.code}`);
          status = STATUS_ERRO;
        }
      }
      //******************************************************************************************* */
      item.status = status;
    }

    if (nao_validado > 0) {
      console.log(`Devolução não validada: ${cod_transf}`);
      continue;
    }

    row.sub_status = SUB_STATUS_PROCESSADO_ESTOQUE;
    row.status = STATUS_CONCLUIDO;
    await repository.update(row.id, row);
    await fila.create({ id: cod_transf, created_at: new Date() });
  }
}

const devolucaoController = {
  init,
};

export { devolucaoController };
