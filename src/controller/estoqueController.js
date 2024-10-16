import { lib } from "../utils/lib.js";
import { Tiny } from "../services/tinyService.js";
import { TMongo } from "../infra/mongoClient.js";
import { EstoqueRepository } from "../repository/estoqueRepository.js";
import { ProdutoTinyRepository } from "../repository/produtoTinyRepository.js";
import { AnuncioRepository } from "../repository/anuncioRepository.js";
import { logService } from "../services/logService.js";

async function init() {
  //fazer uma atualizacao dos status =500  e tambem de todos que estão situacao =0
}


//idProduto = id Tiny do Produto
async function produtoAtualizarEstoque(token, id_produto, quantity) {
  let date = new Date();
  let hora = date.getHours(); // 0-23
  let min = date.getMinutes(); // 0-59
  let seg = date.getSeconds(); // 0-59
  let minFmt = min;
  if (min < 10) minFmt = `0${min}`;
  if (quantity < 0) quantity = 0;

  let obs =
    `Estoque Movimentado : ${quantity} as ` +
    lib.formatDateBr(date) +
    ` ${hora}:${minFmt}:${seg} by T7Ti `;

  const estoque = {
    idProduto: id_produto,
    tipo: "B",
    observacoes: obs,
    quantidade: quantity,
  };

  const tiny = new Tiny({ token: token });
  tiny.setTimeout(1000 * 10);
  let response = null;
  const data = [{ key: "estoque", value: { estoque } }];

  for (let t = 1; t < 5; t++) {
    console.log("Atualizando estoque " + t + "/5  " + id_produto + ' qtd: ' + quantity);
    response = await tiny.post("produto.atualizar.estoque.php", data);
    response = await tiny.tratarRetorno(response, "registros");
    if (tiny.status() == "OK") return response;
    response = null;
  }

  return response;
}

async function atualizarPrecosLote(tenant, produtos) {
  const tiny = new Tiny({ token: tenant.token });
  tiny.setTimeout(1000 * 10);
  let response = null;

  let obj = {
    precos: produtos
  }
  const data = [{ key: "data", value: obj }];

  for (let t = 1; t < 5; t++) {
    console.log("Atualizando precos em lote " + t + "/5  ");
    response = await tiny.post("produto.atualizar.precos.php", data);
    response = await tiny.tratarRetorno(response, "registros");
    if (tiny.status() == "OK") return response;
    response = null;
  }
  return response;
}


async function zerarEstoqueGeral(tenant) {
  let c = await TMongo.connect();
  let produtoTinyRepository = new ProdutoTinyRepository(c, tenant.id_tenant);
  let criterio = {
    id_tenant: tenant.id_tenant,
    sys_status: 0,
  }

  let rows = await produtoTinyRepository.findAll(criterio);
  for (let row of rows) {
    console.log("Zerando estoque geral " + row.id + " " + row.codigo);
    let quantidade = 0;
    await produtoAtualizarEstoque(tenant.token, row.id, quantidade);
    row.sys_status = 1;
    await produtoTinyRepository.update(row.id, row);
  }
}

const estoqueController = {
  init,
  produtoAtualizarEstoque,
  zerarEstoqueGeral,
  atualizarPrecosLote,
};

export { estoqueController };
