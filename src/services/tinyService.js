import { tinyApi } from "../api/tinyApi.js";

//fiz aqui pra nao ter a dependencia da lib
function sleep(ms) {
  console.log(`Requisição bloqueada, aguardando ${ms / 1000} segundos...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Tiny {
  timeout = 0;
  local_status = "OK";
  local_data = "";
  constructor({ token }) {
    this.token = token;
    this.local_data = "";
    this.local_status = "";
  }
  async get(url) {
    data.push({ key: "token", value: this.token });
    return await tinyApi(url, [], "GET");
  }
  async post(url, data = []) {
    console.log(url);
    data.push({ key: "token", value: this.token });
    data.push({ key: "formato", value: "json" });
    return await tinyApi(url, data, "POST");
  }
  async put(url, data = []) {
    data.push({ key: "token", value: this.token });
    data.push({ key: "formato", value: "json" });

    return await tinyApi(url, data, "PUT");
  }
  async delete(url) {
    return await tinyApi(`${url}?token=${this.token}`, [], "DELETE");
  }
  async patch(url, data = []) {
    return await tinyApi(`${url}?token=${this.token}`, data, "PATCH");
  }

  async tratarRetorno(response, prop) {
    this.local_status = response?.data?.retorno?.status;
    this.local_data = response?.data;
    if (response.status == 429) {
      await sleep(this.timeout);
      return response?.data;
    }
    let retorno = response?.data?.retorno;
    if (retorno?.status == "OK") {
      return retorno[prop];
    }

    if (retorno?.status == "Erro" || retorno?.status == "Parcial") {
      console.log(JSON.stringify(response?.data));
      if (retorno?.status == "Erro") {
        await sleep(this.timeout);
      }
      return response?.data;
    }
  }

  status() {
    if (this.local_status !== "OK") {
      console.log(this.local_data);
    }
    return this.local_status;
  }

  setTimeout(timeout) {
    if (timeout > 0)
      console.log(
        "Timeout setado para ",
        (timeout / 1000).toFixed(2),
        " segundos"
      );
    else console.log("Timeout desativado");
    this.timeout = timeout;
  }
}

class TinyInfo {
  constructor({ instance }) {
    this.instance = instance;
  }

  async getPaginasProdutos() {
    let page = 1;
    let data = [
      { key: "pesquisa", value: "" },
      { key: "pagina", value: page },
    ];
    let response = await this.instance.post("produtos.pesquisa.php", data);
    let {
      retorno: { numero_paginas: page_count },
    } = response?.data;
    return page_count;
  }

  async getPaginasProdutosDataCriacao(dataCriacao) {
    const data = [{ key: "dataCriacao", value: dataCriacao }];
    let response = await this.instance.post("produtos.pesquisa.php", data);
    let {
      retorno: { numero_paginas: page_count },
    } = response?.data;
    return page_count;
  }

  async getPaginasPedidos(dataInicial) {
    let page = 1;
    let data = [
      { key: "pesquisa", value: "" },
      { key: "dataInicial", value: dataInicial },
      { key: "pagina", value: page },
    ];
    let response = await this.instance.post("pedidos.pesquisa.php", data);
    let {
      retorno: { numero_paginas: page_count },
    } = response?.data;
    return page_count;
  }

  async getDataInicialPedidos() {
    let pedido_numero_dias_processar =
      Number(process.env.PEDIDO_NUMERO_DIAS_PROCESSAR) || 30;

    let dataInicial = lib.formatDateBr(
      lib.addDays(new Date(), pedido_numero_dias_processar * -1)
    );

    return String(dataInicial);
  }
}

export { Tiny, TinyInfo };

/*
# inspiracao 
https://publicapis.io/woocommerce-api

const tiny = new Tiny();
 tiny.put(url, data);
 tiny.post(url, data);
 tiny.get(url);
 tiny.delete(url);
 tiny.patch(url, data);
 
*/
