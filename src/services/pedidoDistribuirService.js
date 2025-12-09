import { PedidoDistribuirRepository } from "../repository/pedidoDistribuirRepository.js";
import { MpkIntegracaoNewRepository } from "../repository/mpkIntegracaoNewRepository.js";
import { PedidoVendaRepository } from "../repository/pedidoVendaRepository.js";
import { ProdutoTinyV2Repository } from "../repository/produtoTinyV2Repository.js";
import { ProdutoUrlRepository } from "../repository/produtoUrlRepository.js";
import { EstoqueService } from "./estoqueService.js";
import { lib } from "../utils/lib.js";
import { url } from "inspector";

const status_pendente = 1;
const status_distribuido = 2;
const status_processando = 3;
const status_concluido = 10;
const nomeDeposito = "Geral";
const nomeEmpresa = "gutlog";
const prefixoEmpresa = "gutgut";

export class PedidoDistribuirService {
  constructor() {
    this.pedidoDistribuir = new PedidoDistribuirRepository();
    this.mpkIntegracaoNewRepository = new MpkIntegracaoNewRepository();
    this.pedidoVendaRepository = new PedidoVendaRepository();
    this.produtoUrlRepository = new ProdutoUrlRepository();
    this.depositos = [];
    this.lojas = [];
  }

  async distribuirPedido(items) {
    // Lógica para distribuir o pedido
    if (!Array.isArray(items)) {
      console.log("Items deve ser um array para distribuir o pedido");
      return;
    }

    const loja_deposito = 1;
    const solicitado = 1;
    const nao_solicitado = 2;

    const pedidos = new Set();
    let hasEstoque = [];

    //preciso registrar se tem estoque em alguma loja
    for (const item of items) {
      if (item.status_loja === solicitado) {
        hasEstoque.push(item.codigo);
      }
    }

    for (const item of items) {
      let payload = { status: status_distribuido };
      let pedidoId = item?.pedido?.id || null;
      let codigo = item.codigo;

      //preciso validar o item esta registrado como sem estoque
      if (!hasEstoque.includes(codigo)) {
        if (item.id_tenant == loja_deposito) {
          item.status_loja = solicitado; //forçar a enviar mesmo sem estoque
        }
      }
      let response = await this.pedidoDistribuir.update(item.id, item);

      if (!response) {
        console.log(
          `Erro ao distribuir o item ${item.codigo} do pedido ${pedidoId}`
        );
      } else {
        if (!pedidos.has(pedidoId)) {
          try {
            await this.pedidoVendaRepository.update(pedidoId, payload);
            pedidos.add(pedidoId);
          } catch (error) {
            console.log(
              `Erro ao atualizar o status do pedido ${pedidoId}: ${error.message}`
            );
          }
        }
      }
    }
  }

  async getProdutosByCodigo(codigo = "") {
    const produtoTinyRepository = new ProdutoTinyV2Repository();
    return await produtoTinyRepository.findAll({
      codigo: String(codigo),
    });
  }

  async getDepositos() {
    if (this.depositos.length > 0) {
      return this.depositos;
    }

    this.depositos = await this.mpkIntegracaoNewRepository.findAll({
      importar_pedido: "1",
    });
    return this.depositos;
  }

  async getTenantsByProximidade() {
    // Retorna a lista de tenants ordenados por proximidade
    if (this.lojas.length > 0) {
      return this.lojas;
    }

    // Lógica para obter o tenant por proximidade
    const rows = await this.mpkIntegracaoNewRepository.findAll({});

    //ordenar por proximidade - implementar lógica de proximidade aqui campo  nivel_proximidade
    this.lojas = rows.sort((a, b) => {
      // lógica de comparação para ordenar por proximidade
      return a.nivel_proximidade - b.nivel_proximidade;
    });
    return this.lojas;
  }

  async getPedidosByStatus(id_tenant, status = status_pendente) {
    return await this.pedidoVendaRepository.findAll({
      id_tenant: id_tenant,
      status: status,
    });
  }

  async getPedidosPendentes(id_tenant) {
    return await this.getPedidosByStatus(id_tenant, status_pendente);
  }

  async processarPedidosPendentes() {
    // Lógica para processar pedidos do importar_pedidos = 1
    const tenants = await this.getDepositos();
    for (const tenant of tenants) {
      const pedidosPendentes = await this.getPedidosPendentes(tenant.id);
      // Processar cada pedido pendente
      for (const pedido of pedidosPendentes) {
        await this.processarPedido(pedido);
        //return; // para testes
      }
    }
  }

  async processarPedido(pedido) {
    // Lógica para processar um pedido específico
    let itens = pedido?.itens || [];
    let items_movto = [];
    let id_tenant = parseInt(pedido.id_tenant);

    // Lógica adicional para processar os itens do pedido
    for (const item of itens) {
      // Processar cada item do pedido
      let prod = item?.item || {};
      let quantidade = parseFloat(prod?.quantidade || 0);
      let id_produto = prod?.id_produto || "";

      //preciso obter o estoque
      let estoques = await this.getEstoquesById(id_tenant, id_produto);
      const distribuicao = await this.distribuicaoCondicional(
        prod?.codigo,
        estoques,
        quantidade
      );

      for (const d of distribuicao.items) {
        d.pedido = pedido;
        d.numero_pedido = pedido?.numero || "";
        d.numero_ecommerce = pedido?.numero_ecommerce || "";
        d.nome_ecommerce = pedido?.ecommerce?.nomeEcommerce || "";
        d.id_pedido = pedido?.id || "";
      }
      items_movto.push(...distribuicao.items);

      // Processar resultado da distribuição
      if (distribuicao.distribuicaoCompleta) {
        console.log(`Produto ${prod?.codigo}: Distribuição completa`);
      } else {
        console.log(
          `Produto ${prod?.codigo}: Distribuição parcial. Faltam ${distribuicao.quantidadeRestante} unidades`
        );
      }
    }

    //console.log(items_movto);
    //distribuir o pedido na fila de distribuição
    await this.distribuirPedido(items_movto);
  }

  ajustarCodigoLoja(codigo_loja) {
    // Ajusta o código da loja conforme necessário gutgut.cx
    if (codigo_loja.toLowerCase() === nomeEmpresa) {
      return "GP";
    }

    if (codigo_loja.toLowerCase().startsWith(prefixoEmpresa + ".")) {
      codigo_loja = codigo_loja.substring(prefixoEmpresa.length + 1);
    }
    //retornar em maisculo e sem espaços
    return codigo_loja.trim().toUpperCase();
  }

  async distribuicaoCondicional(codigo, estoques, quantidade) {
    let items = [];
    let estoqueDeposito = estoques?.depositos || [];
    let quantidadeRestante = quantidade;

    //quero gerar um array com os códigos das lojas + saldo
    let depositos = estoqueDeposito
      .filter((d) => d?.deposito?.desconsiderar !== "S")
      .map((d) => ({
        empresa: this.ajustarCodigoLoja(d?.deposito?.empresa),
        saldo: parseFloat(d?.deposito?.saldo || 0),
        nivel_proximidade: 0,
      }));
    if (!Array.isArray(depositos)) {
      depositos = [];
    }

    let lojas = await this.getTenantsByProximidade();
    // Atribuir nivel_proximidade aos depositos baseado nas lojas

    depositos.forEach((dep, index) => {
      const d = depositos[index];
      const loja = lojas.find((l) => l.codigo === d.empresa);
      dep.nivel_proximidade = loja ? loja.nivel_proximidade : 999;

      //porque GP ja desconta do estoque
      if (loja?.importar_pedido === "1") {
        dep.saldo = parseFloat(dep?.saldo || 0) + quantidade;
      }
    });

    // Ordenar depositos por nivel_proximidade
    depositos = depositos.sort(
      (a, b) => a.nivel_proximidade - b.nivel_proximidade
    );

    let produtos = await this.getProdutosByCodigo(codigo);
    let url_produto = "";

    for (const loja of lojas) {
      let saldoLoja = 0;
      let quantidadeDeposito = 0;
      let produto_id = null;

      //Necesario percorrer todas as lojas mesmo que a quantidade ja tenha sido suprida  12-11-2025 ( porque o gestor pode decidir distribuir parcialmente)
      //   // Parar se já foi suprida toda a quantidade necessária
      //   if (quantidadeRestante <= 0) {
      //     break;
      //   }

      // lógica para distribuir para cada loja
      let _empresa = `${prefixoEmpresa}.${loja.codigo.toLowerCase()}`;
      if (loja?.importar_pedido === "1") {
        _empresa = nomeEmpresa;
        //Motivo de fazer é que ao receber o pedido o estoque do deposito ja desconta o estoque , em determinadas situações fica negativo
        quantidadeDeposito = parseFloat(quantidade);
      }

      let dep = estoqueDeposito.find(
        (dep) => dep?.deposito?.empresa === _empresa
      );
      if (dep) {
        saldoLoja = parseFloat(dep?.deposito?.saldo || 0) + quantidadeDeposito;
      }

      let produtoInfo = produtos.find(
        (p) => p.id_tenant === loja.id && p.codigo === codigo
      );

      if (produtoInfo) {
        produto_id = produtoInfo?.id;
        if (produtoInfo._id) delete produtoInfo._id;
        if (produtoInfo.data_criacao) delete produtoInfo.data_criacao;
        if (produtoInfo.sys_estoque) delete produtoInfo.sys_estoque;
        if (produtoInfo.id) delete produtoInfo.id;
      }

      if (url_produto === "") {
        // Obter URL do produto , vai entrar uma única vez
        const produtoUrlData = await this.produtoUrlRepository.findOne({
          variant_sku: codigo,
        });
        url_produto = produtoUrlData ? produtoUrlData?.variant_image : "";
      }

      // Só processar lojas que têm saldo disponível
      if (saldoLoja > 0 && quantidadeRestante > 0) {
        // Calcular a quantidade a ser retirada desta loja
        // (mínimo entre o saldo disponível e a quantidade restante necessária)
        let quantidadeRetirada = Math.min(saldoLoja, quantidadeRestante);

        // Descontar da quantidade restante
        quantidadeRestante -= quantidadeRetirada;

        // Adicionar à lista de distribuição
        items.push({
          id_produto: produto_id,
          codigo: codigo,
          id_tenant: loja.id,
          codigo_loja: loja.codigo,
          status_loja: 1,
          quantidade: quantidadeRetirada,
          qtd_enviada: 0,
          qtd_solicitada: quantidade,
          saldoDisponivel: saldoLoja,
          ...produtoInfo,
          id: await lib.newUUId(),
          dt_movto: new Date(),
          url_produto: url_produto,
          qtd_carrinho: 0,
          depositos,
          obs_logistica: "",
        });

        console.log(
          `Loja ${loja.codigo}: Retirado ${quantidadeRetirada} de ${saldoLoja} disponível. Restante: ${quantidadeRestante}`,
          codigo
        );
      } else {
        console.log(
          "Saldo da loja " + loja.codigo + ": " + saldoLoja + " (sem estoque)",
          codigo
        );

        items.push({
          id_produto: produto_id,
          codigo: codigo,
          id_tenant: loja.id,
          codigo_loja: loja.codigo,
          status_loja: 2,
          quantidade: 0,
          qtd_enviada: 0,
          qtd_solicitada: quantidade,
          saldoDisponivel: saldoLoja,
          ...produtoInfo,
          id: await lib.newUUId(),
          dt_movto: new Date(),
          url_produto: url_produto,
          qtd_carrinho: 0,
          depositos,
          obs_logistica: "",
        });
      }
    }

    // Verificar se foi possível suprir toda a quantidade solicitada
    if (quantidadeRestante > 0) {
      console.log(
        `ATENÇÃO: Não foi possível suprir toda a quantidade solicitada. Faltam ${quantidadeRestante} unidades do produto ${codigo}`
      );
    } else {
      console.log(
        `Distribuição completa para o produto ${codigo}. Quantidade ${quantidade} totalmente suprida.`
      );
    }

    //console.log(items);

    return {
      items: items,
      quantidadeDistribuida: quantidade - quantidadeRestante,
      quantidadeRestante: quantidadeRestante,
      distribuicaoCompleta: quantidadeRestante === 0,
    };
  }

  async getEstoquesById(id_tenant, idProdutoTiny) {
    const depositos = await this.getDepositos();
    let produto = {};
    for (const dep of depositos) {
      if (dep.id !== id_tenant) {
        continue;
      }
      let estoqueService = new EstoqueService(dep.token);
      try {
        produto = await estoqueService.getEstoque(idProdutoTiny);
        break;
      } catch (error) {}
    }
    return produto;
  }
}
