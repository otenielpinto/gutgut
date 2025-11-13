//Classe tem letras maiuculoas

import { Repository } from "./baseRepository.js";

class PedidoVendaRepository extends Repository {
  constructor(id_tenant = null) {
    super("tmp_pedido_venda", id_tenant);
  }

  // Métodos personalizados específicos para PedidoVenda podem ser adicionados aqui
  // Os métodos básicos (create, update, delete, findAll, findById, etc.)
  // já estão disponíveis através da herança da TRepository

  // async findByNome(nome) {
  //   return await this.findOne({ nome: nome });
  // }

  // async findActiveModelos() {
  //   return await this.findAll({ ativo: true });
  // }
}

export { PedidoVendaRepository };
