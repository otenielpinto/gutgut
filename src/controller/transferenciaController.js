import { TransferenciaRepository } from "../repository/transferenciaRepository.js";
import { TransferenciaFilaRepository } from "../repository/transferenciaFilaRepository.js";
import { TransferenciaMovtoRepository } from "../repository/transferenciaMovtoRepository.js";
import { ProdutoTinyRepository } from "../repository/produtoTinyRepository.js";
import { MpkIntegracaoRepository } from "../repository/mpkIntegracaoRepository.js";
import fs from "fs";

import { estoqueController } from "./estoqueController.js";

import { TMongo } from "../infra/mongoClient.js";
import { lib } from "../utils/lib.js";

const STATUS_CONFIRMADO = "Confirmado";
const STATUS_CONCLUIDO = "Concluido";
const STATUS_PENDENTE = "Pendente";
const STATUS_ERRO = "Erro";
const SUB_STATUS_PROCESSANDO = "Processando";
const SUB_STATUS_PROCESSADO_ESTOQUE = "Processado_estoque";

// Variável global para armazenar as transferências processadas
let listaTransferencias = [];
let ultimaDataVerificacao = new Date().toDateString();

function verificarMudancaDia() {
  const dataAtual = new Date().toDateString();
  console.log(
    `Verificando mudança de dia: ${dataAtual} - Última verificação: ${ultimaDataVerificacao}`
  );

  if (dataAtual !== ultimaDataVerificacao) {
    console.log(
      `Dia mudou de ${ultimaDataVerificacao} para ${dataAtual} - Zerando lista de transferências`
    );
    listaTransferencias = [];
    ultimaDataVerificacao = dataAtual;
    return true;
  }

  return false;
}

async function init() {
  await processarTransferenciaConfirmada();
  await processarEstoque();
}

async function processarTransferenciaConfirmada() {
  const c = await TMongo.connect();
  let repository = new TransferenciaRepository(c);
  let mpkIntegracao = new MpkIntegracaoRepository(c);
  let empresas = await mpkIntegracao.findAll({});

  //Busco o id do produto no tiny e atualizo no item da transferencia
  for (let empresa of empresas) {
    let rows = await repository.findAll({
      status: STATUS_CONFIRMADO,
      to_id_company: empresa.id,
    });

    if (!Array.isArray(rows) && rows.length <= 0) continue;
    let produto = new ProdutoTinyRepository(c, empresa.id);
    let nao_conformidade = 0;

    for (const row of rows) {
      let items = row.items;
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
      }

      //disparar um log de erro se nao achou produto
      if (nao_achou_produto > 0) {
        console.error(
          `Erro: Produto não encontrado para a transferência: ${row.id}`
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
  verificarMudancaDia();
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
    let items = row.items;
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

    if (!listaTransferencias.includes(cod_transf))
      listaTransferencias.push(cod_transf);

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
          `Transferencia não validada, falta id_entrada ou id_saida: ${item?.code}`
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
          doc
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
          doc
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
    }

    // console.log(retorno);
    // //salvar o retorno em arquivo txt
    // if (retorno.length > 0) {
    //   const filePath = `transferencia_com_erros.txt`;
    //   const data = retorno.map((item) => JSON.stringify(item)).join("\n");
    //   fs.write;
    //   fs.writeFile(filePath, data, (err) => {
    //     if (err) {
    //       console.error("Erro ao salvar o arquivo:", err);
    //     } else {
    //       console.log("Arquivo salvo com sucesso:", filePath);
    //     }
    //   });
    // }

    //disparar um log de erro se nao achou produto
    if (nao_validado > 0) {
      console.log(`Transferencia não validada: ${cod_transf}`);
      continue;
    }

    row.sub_status = SUB_STATUS_PROCESSADO_ESTOQUE;
    row.status = STATUS_CONCLUIDO;
    await repository.update(row.id, row);
    await fila.create({ id: cod_transf, created_at: new Date() });

    if (listaTransferencias.length > 100) {
      listaTransferencias.shift(); // Limitar o tamanho da lista para evitar consumo excessivo de memória
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
  verificarMudancaDia,
};

export { transferenciaController };
