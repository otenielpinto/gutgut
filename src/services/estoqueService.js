import { lib } from "../utils/lib.js";
import { Tiny } from "./tinyService.js";

export class EstoqueService {
  //métodos relacionados ao estoque
  constructor(token) {
    this.token = token;
  }

  async getEstoque(idProdutoTiny) {
    const tiny = new Tiny({ token: this.token });
    const estoqueData = [{ key: "id", value: idProdutoTiny }];
    let response = await tiny.post("produto.obter.estoque.php", estoqueData);
    let produto = await tiny.tratarRetorno(response, "produto");
    let tentativas = 0;
    while (tiny.status() !== "OK" && tentativas < 3) {
      tentativas += 1;
      await lib.sleep(1000 * tentativas); //espera 10 segundos antes de tentar novamente
      response = await tiny.post("produto.obter.estoque.php", estoqueData);
      produto = await tiny.tratarRetorno(response, "produto");
    }

    return produto;
  }
}
