//Classe tem letras maiuculoas

import { Repository } from "./baseRepository.js";

class MpkIntegracaoNewRepository extends Repository {
  constructor(id_tenant = null) {
    super("mpk_integracao", id_tenant);
  }

  // Métodos personalizados específicos para Modelo podem ser adicionados aqui
  // Os métodos básicos (create, update, delete, findAll, findById, etc.)
  // já estão disponíveis através da herança da TRepository

  // async findByNome(nome) {
  //   return await this.findOne({ nome: nome });
  // }

  // async findActiveModelos() {
  //   return await this.findAll({ ativo: true });
  // }

   


}

export { MpkIntegracaoNewRepository };
