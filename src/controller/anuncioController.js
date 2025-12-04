import { lib } from "../utils/lib.js";
import { AnuncioRepository } from "../repository/anuncioRepository.js";
import { Tiny, TinyInfo } from "../services/tinyService.js";
import { TMongo } from "../infra/mongoClient.js";
import { ProdutoTinyRepository } from "../repository/produtoTinyRepository.js";
import { EstoqueRepository } from "../repository/estoqueRepository.js";
import { estoqueController } from "./estoqueController.js";
import { marketplaceTypes } from "../types/marketplaceTypes.js";
import { systemService } from "../services/systemService.js";
import { mpkIntegracaoController } from "./mpkIntegracaoController.js";
import { MigrateRepository } from "../repository/migrateRepository.js";

var filterTiny = {
  id_mktplace: marketplaceTypes.tiny,
};

async function init() {
  if (global.config_debug == 1) {
    return;
  }

  //importar mensalmente todos os produtos ( sincronização mensal )
  await importarProdutoTinyMensal();

  //atualizar novos produtos cadastrados no tiny  5 minutos
  await importarProdutoTinyDiario();

  //exclua todos os produtos que foram excluido do tiny 1 x ao dia
  await excluirProdutoTiny();
}

async function excluirProdutoTiny() {
  let tenants = await mpkIntegracaoController.findAll(filterTiny);
  for (let tenant of tenants) {
    let key = "Excluir Produtos Database " + tenant.id_tenant;
    if ((await systemService.started(tenant.id_tenant, key)) == 1) continue;
    await excluirProdutoByTenant(tenant);
  }
}

async function excluirProdutoByTenant(tenant) {
  TMongo.close();
  let produtoTinyRepository = new ProdutoTinyRepository(
    await TMongo.connect(),
    tenant.id_tenant
  );

  const tiny = new Tiny({ token: tenant.token });
  tiny.setTimeout(1000 * 10);
  let page = 1;
  let data = [
    { key: "pesquisa", value: "" },
    { key: "situacao", value: "E" },
    { key: "pagina", value: page },
  ];
  let result = await tiny.post("produtos.pesquisa.php", data);
  let page_count = result?.data?.retorno?.numero_paginas;

  let response;
  for (let page = page_count; page > 0; page--) {
    data = [
      { key: "pesquisa", value: "" },
      { key: "situacao", value: "E" },
      { key: "pagina", value: page },
    ];
    result = null;
    response = null;

    for (let t = 1; t < 5; t++) {
      console.log(
        tenant.id_tenant +
          ">>" +
          "Tentativa: " +
          t +
          "  Paginas: " +
          page_count +
          " de " +
          page
      );
      result = await tiny.post("produtos.pesquisa.php", data);
      response = await tiny.tratarRetorno(result, "produtos");
      if (tiny.status() == "OK") break;
      response = null;
    }

    if (!Array.isArray(response)) continue;
    let items = [];

    for (let item of response) {
      let obj = item?.produto ? item?.produto : {};
      if (!obj?.id) continue;
      obj.id_tenant = tenant.id_tenant;
      obj.updated_at = new Date();
      items.push(obj);
    }
    let rows = [];
    for (let item of items) rows.push(String(item.id));

    response = await produtoTinyRepository.deleteMany({ id: { $in: rows } });
    console.log(response);
  }
}

async function importarProdutoTinyMensal() {
  //Desativado porque isso pode gerar problemas de performance
  //Apenas ajustar para validar os ultimos 30 dias de produtos
  // console.log("[DESATIVADO]Importar produtos mensalmente");
  //return;

  let tenants = await mpkIntegracaoController.findAll(filterTiny);
  let key = "importarProdutoTinyMensal";
  for (let tenant of tenants) {
    if ((await systemService.monthlyTaskExecuted(tenant.id_tenant, key)) == 1) {
      console.log(
        "Tarefa mensal ja executada para o tenant " + tenant.id_tenant
      );
      continue;
    }

    try {
      await systemService.markMonthlyTaskExecuted(tenant.id_tenant, key);
    } finally {
      await importarProdutoTinyByTenant(tenant);
    }
  }
}

async function importarProdutoTinyDiario() {
  TMongo.close();
  let tenants = await mpkIntegracaoController.findAll(filterTiny);
  const c = await TMongo.connect();
  const MAX_RECORDS = 100;
  let key = "importarProdutoTinyDiario_ultimos_7dias";

  for (let tenant of tenants) {
    let produtoTinyRepository = new ProdutoTinyRepository(c, tenant.id_tenant);
    let tiny = new Tiny({ token: tenant.token });
    let info = new TinyInfo({ instance: tiny });

    let max_day = 7;
    if ((await systemService.started(tenant.id_tenant, key)) == 1) max_day = 2; //apenas 2 dias

    for (let idx = max_day; idx >= 0; idx--) {
      let desde = lib.formatDateBr(lib.addDays(new Date(), idx * -1));
      let pages = await info.getPaginasProdutosDataCriacao(desde);
      if (!pages || pages == 0) pages = 1;

      console.log("Tenant:", tenant.id, "Desde : ", desde, " idx:", idx);
      let page = 0;
      while (page < pages) {
        page++;
        console.log("Pagina : ", page + "/" + pages);
        let response = await produtoPesquisaByDataCriacao(tenant, desde, page);

        if (!Array.isArray(response)) break;
        console.log("A consulta retornou", response?.length || 0, " registros");

        for (let item of response) {
          let obj = item?.produto ? item?.produto : {};
          if (!obj?.id) continue;

          let res = await produtoTinyRepository.updateOrCreate(
            obj?.codigo,
            obj
          );
          console.log(res.modifiedCount, obj.codigo);
        }
        if (response?.length < MAX_RECORDS) break;
      }
    }
  }
}

async function atualizarPrecoVendaTiny() {
  let tenants = await mpkIntegracaoController.findAll(filterTiny);
  let max_lote = 20;
  const c = await TMongo.connect();
  for (let tenant of tenants) {
    let anuncioRepository = new AnuncioRepository(c, tenant.id_tenant);
    let where = {
      id_tenant: tenant.id_tenant,
      id_marketplace: tenant.id_mktplace,
      status: 0,
    };

    let precos = [];
    let lotes = [];
    let rows = await anuncioRepository.findAll(where);

    for (let row of rows) {
      if (row?.id_anuncio_mktplace) {
        lotes.push(row);
        precos.push({
          id: String(row.id_anuncio_mktplace),
          preco: String(row.preco),
          preco_promocional: String(row.preco_promocional),
        });
      }

      if (precos.length == max_lote) {
        await estoqueController.atualizarPrecosLote(tenant, precos);
        lotes = await processarLote(anuncioRepository, lotes);
        precos = [];
      }
    }

    if (precos.length > 0) {
      await estoqueController.atualizarPrecosLote(tenant, precos);
      lotes = await processarLote(anuncioRepository, lotes);
    }
  }
}

async function processarLote(anuncioRepository, lotes) {
  for (let row of lotes) {
    row.status = 1;
    await anuncioRepository.update(row.id, row);
  }
  return [];
}

async function atualizarEstoqueEcommerce() {
  let tenants = await mpkIntegracaoController.findAll(filterTiny);
  for (let tenant of tenants) {
    console.log(
      "Inicio do processamento do estoque Servidor Tiny do tenant " +
        tenant.id_tenant
    );
    await modificarStatusEstoque(tenant);
    await processarEstoqueByTenant(tenant);
    console.log(
      "Fim do processamento do estoque Servidor Tiny do tenant " +
        tenant.id_tenant
    );
  }
}

async function modificarStatusEstoque(tenant) {
  const c = await TMongo.connect();
  const estoqueRepository = new EstoqueRepository(c, tenant.id_tenant);
  const estoqueTiny = new ProdutoTinyRepository(c, tenant.id_tenant);
  const separador = "*".repeat(100);
  let record = 0;
  let rows = await estoqueRepository.findAll({
    status: 0,
    id_tenant: tenant.id_tenant,
    id_integracao: tenant.id,
  });
  let record_count = rows?.length;
  for (let row of rows) {
    console.log(`Lendo: ${record++}/${record_count}`);
    row.status = 1;
    let sys_codigo = String(row?.id_produto);
    let sys_estoque = Number(row?.estoque);
    let sys_status = 0;

    //atualizar todos os codigos do tiny
    let r = await estoqueTiny.updateBySysCodigo(sys_codigo, {
      sys_estoque,
      sys_status,
    });
    if (!r)
      r = await estoqueTiny.updateByCodigo(sys_codigo, {
        sys_estoque,
        sys_status,
      });
    if (!r) {
      console.log("Produto não encontrado no Tiny " + sys_codigo);
      if (row.id_variant_mktplace && row.id_variant_mktplace != "") {
        await estoqueController.produtoAtualizarEstoque(
          tenant.token,
          row.id_variant_mktplace,
          0
        );
      }
      console.log(separador);
    }

    //atualizar status estoque
    await estoqueRepository.update(row.codigo, row);
  }
}

async function importarProdutoTinyByTenant(tenant) {
  TMongo.close();
  let produtoTinyRepository = new ProdutoTinyRepository(
    await TMongo.connect(),
    tenant.id_tenant
  );

  const tiny = new Tiny({ token: tenant.token });
  tiny.setTimeout(1000 * 10);
  let page = 1;
  let data = [
    { key: "pesquisa", value: "" },
    { key: "pagina", value: page },
  ];
  let result = await tiny.post("produtos.pesquisa.php", data);
  let page_count = result?.data?.retorno?.numero_paginas;

  //Sim apago todos os registros --- Muito mais rapido
  //await produtoTinyRepository.deleteMany({ id_tenant: tenant.id_tenant });

  let response;
  for (let page = page_count; page > 0; page--) {
    data = [
      { key: "pesquisa", value: "" },
      { key: "pagina", value: page },
    ];
    result = null;
    response = null;

    for (let t = 1; t < 5; t++) {
      console.log(
        tenant.id_tenant +
          ">>" +
          "Tentativa: " +
          t +
          "  Paginas: " +
          page_count +
          " de " +
          page
      );
      result = await tiny.post("produtos.pesquisa.php", data);
      response = await tiny.tratarRetorno(result, "produtos");
      if (tiny.status() == "OK") break;
      response = null;
    }

    if (!Array.isArray(response)) continue;
    let items = [];

    for (let item of response) {
      let obj = item?.produto ? item?.produto : {};
      if (!obj?.id) continue;
      obj.id_tenant = tenant.id_tenant;
      obj.updated_at = new Date();
      items.push(obj);
    }

    //excluir por codigo antes de inserir
    let rows = items.map((i) => String(i.codigo));
    let resdelMany = await produtoTinyRepository.deleteMany({
      codigo: { $in: rows },
      id_tenant: tenant.id_tenant,
    });
    console.log("excluidos:", resdelMany.deletedCount);

    //inserir novos registros
    let res = await produtoTinyRepository.insertMany(items);
    console.log("inseridos:", res.insertedCount);

    //se nao inseriu, tentar um a um
    if (!res || res.insertedCount != items.length) {
      console.log(
        `Nem todos os produtos foram inseridos no tenant ${tenant.id_tenant}. Tentando inserir um a um...`
      );
      for (let item of items) {
        await produtoTinyRepository.update(item.id, item);
      }
    }
  }
}

async function importarProdutoTiny() {
  let tenants = await mpkIntegracaoController.findAll(filterTiny);

  let key = "importarProdutoTiny";
  for (let tenant of tenants) {
    if ((await systemService.started(tenant.id_tenant, key)) == 1) continue;
    await importarProdutoTinyByTenant(tenant);
  }
}

async function obterProdutoEstoque(tiny, id) {
  let data = [{ key: "id", value: id }];
  let response = null;

  for (let t = 1; t < 5; t++) {
    response = await tiny.post("produto.obter.estoque.php", data);
    response = await tiny.tratarRetorno(response, "produto");
    if (tiny.status() == "OK") break;
    response = null;
  }
  return response;
}

async function produtoPesquisaByDataCriacao(tenant, dataCriacao, page = 1) {
  const data = [
    { key: "dataCriacao", value: dataCriacao },
    { key: "pagina", value: page ? page : 1 },
  ];
  let response = null;
  const tiny = new Tiny({ token: tenant.token });
  tiny.setTimeout(1000 * 10);

  for (let t = 1; t < 5; t++) {
    response = await tiny.post("produtos.pesquisa.php", data);
    if (response?.data?.retorno?.codigo_erro == 20) {
      console.log("A consulta não retornou registros");
      response = null;
      break;
    }
    response = await tiny.tratarRetorno(response, "produtos");
    if (tiny.status() == "OK") break;
    response = null;
  }
  return response;
}

async function processarEstoqueByTenant(tenant) {
  const c = await TMongo.connect();
  let id_tenant = Number(tenant.id_tenant);
  const max_lote_job = 100;
  const prodTinyRepository = new ProdutoTinyRepository(c, id_tenant);
  const estoqueRepository = new EstoqueRepository(c, id_tenant);
  const tiny = new Tiny({ token: tenant.token });
  tiny.setTimeout(1000 * 10);
  let dateStart = lib.currentDateTimeStr();

  const produtos = await prodTinyRepository.findAll({
    sys_status: 0,
    id_tenant: id_tenant,
  });
  let separador = "*".repeat(100);
  let response = null;
  let status = 1;
  let count_time_job = 0;
  let record = 1;
  let record_count = produtos?.length || 0;
  for (let produto of produtos) {
    console.log(`Lendo: ${record++}/${record_count}    Inicio: ${dateStart}`);
    console.log(`Produto: ${produto.id}`);
    response = await obterProdutoEstoque(tiny, produto.id);
    let id_produto = Number(lib.onlyNumber(produto?.codigo));
    status = 1;
    count_time_job++;

    let saldo_tiny = Number(response?.saldo ? response?.saldo : 0);
    let qt_estoque = Number(response?.sys_estoque ? response?.sys_estoque : 0);
    if (!response || !response?.sys_estoque) {
      response = await estoqueRepository.findByIdProduto(id_produto);
      qt_estoque = Number(response?.estoque ? response?.estoque : 0);
    }

    //estoque geral pode ter sido atualizado por outro job
    if (count_time_job > max_lote_job && qt_estoque > 0) {
      count_time_job = 0;
      response = await estoqueRepository.findByIdProduto(id_produto);
      let new_estoque = Number(response?.estoque ? response?.estoque : 0);
      if (new_estoque != qt_estoque) {
        qt_estoque = new_estoque;
      }
    }

    let p = produto?.codigo;
    let t = produto?.tipoVariacao;
    console.log(`Estoque:${qt_estoque} EstoqueTiny:${saldo_tiny} ${t} P=${p}`);

    if (qt_estoque != saldo_tiny && produto.tipoVariacao != "P") {
      console.log(" E S T O Q U  E     A J U S T A D O  ! !  ");
      response = await estoqueController.produtoAtualizarEstoque(
        tenant.token,
        produto.id,
        qt_estoque
      );

      if (response?.registro?.status != "OK") status = 500;
    }
    console.log(separador);

    produto.sys_status = status;
    if (produto.sys_status == 500) {
      console.log(separador);
      console.log("Produto nao atualizado no Tiny " + produto.id);
      console.log(separador);
      //gravar em outra tabela de produto nao atualizado
    }

    await prodTinyRepository.update(produto.id, produto);
  } //for produtos
}

async function relatorioProdutosSemCodigo() {
  return; //vou executar diretamente no frontend
  TMongo.close();
  let tenants = await mpkIntegracaoController.findAll(filterTiny);
  const c = await TMongo.connect();
  let key = "relatorioProdutosSemCodigo";

  for (let tenant of tenants) {
    let produtoTinyRepository = new ProdutoTinyRepository(c, tenant.id_tenant);
    //if ((await systemService.started(tenant.id_tenant, key)) == 1) continue;
    let rows = await produtoTinyRepository.findSemCodigo();
    if (!rows || rows.length == 0) {
      console.log(
        `Tenant ${tenant.id_tenant} - Não existem produtos sem código`
      );
      continue;
    }
    console.log(
      `Tenant ${tenant.id_tenant} - Encontrados ${rows.length} produtos sem código`
    );
    for (let row of rows) {
      console.log(
        `Produto: ${row.id} - ${row.nome} - ${row.descricao} - ${row.tipoVariacao}`
      );
      await lib.sleep(1000 * 10); //para não travar o console
    }
  }
}

const AnuncioController = {
  init,
  importarProdutoTinyMensal,
};

export { AnuncioController };
