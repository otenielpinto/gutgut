import { ProdutoSemCodigoRepository } from "../repository/produtoSemCodigoRepository.js";
import { ProdutoTinyRepository } from "../repository/produtoTinyRepository.js";
import { mpkIntegracaoController } from "./mpkIntegracaoController.js";
import { lib } from "../utils/lib.js";

import { Tiny } from "../services/tinyService.js";
import { TMongo } from "../infra/mongoClient.js";

async function init() {
  await processarProdutoSemCodigo();
}

async function processarProdutoSemCodigo() {
  let tentants = await mpkIntegracaoController.findAll();

  for (const tenant of tentants) {
    await processarProdutoSemCodigoByTenant(tenant);
  }
}

async function processarProdutoSemCodigoByTenant(tenant) {
  const c = await TMongo.connect();
  const produtoSemCodigoRepository = new ProdutoSemCodigoRepository(c);
  let tiny = new Tiny({ token: tenant.token });
  tiny.setTimeout(1000 * 15);
  let produtos = await produtoSemCodigoRepository.findAll({
    id_tenant: tenant.id_tenant,
  });

  let produtoTinyRepository = new ProdutoTinyRepository(c, tenant.id_tenant);

  for (const produto of produtos) {
    let id = produto.id;
    let data = [{ key: "id", value: id }];
    let response = null;

    for (let t = 1; t < 5; t++) {
      response = await tiny.post("produto.obter.php", data);
      response = await tiny.tratarRetorno(response, "produto");
      if (tiny.status() == "OK") break;
      response = null;
    }
    if (!response) {
      console.log(
        `Produto sem codigo [${id}] não encontrado no Tiny, tenant: ${tenant.id_tenant}`
      );
      continue;
    }

    if (response?.codigo) {
      await produtoSemCodigoRepository.delete(id);
      continue;
    }

    let nome = response.nome;
    let tipoEmbalagem = response.tipoEmbalagem;
    let alturaEmbalagem = response.alturaEmbalagem;
    let comprimentoEmbalagem = response.comprimentoEmbalagem;
    let larguraEmbalagem = response.larguraEmbalagem;
    let diametroEmbalagem = response.diametroEmbalagem;
    delete response.tipoEmbalagem;
    delete response.alturaEmbalagem;
    delete response.comprimentoEmbalagem;
    delete response.larguraEmbalagem;
    delete response.diametroEmbalagem;
    response.tipo_embalagem = tipoEmbalagem;
    response.altura_embalagem = alturaEmbalagem;
    response.comprimento_embalagem = comprimentoEmbalagem;
    response.largura_embalagem = larguraEmbalagem;
    response.diametro_embalagem = diametroEmbalagem;
    let deleted = false;

    response.sequencia = "1";
    response.marca = "inativo";
    response.nome = nome + " - " + (await lib.newUUId());
    data = [{ key: "produto", value: { produtos: [{ produto: response }] } }];
    response = await tiny.post("produto.alterar.php", data);
    if (response?.data?.retorno?.status == "OK") {
      deleted = true;
    }
    console.log(JSON.stringify(response.data.retorno));

    if (deleted) {
      await produtoSemCodigoRepository.delete(id);
      await produtoTinyRepository.delete(id);
      console.log(
        `Produto sem codigo [${id}] deletado, tenant: ${tenant.id_tenant}`
      );
      await lib.sleep(1000 * 2);
    }
  }
}

const produtoSemCodigoController = {
  init,
};

export { produtoSemCodigoController };
