import { Repository } from "./baseRepository.js";

class MovEstoqueRepository extends Repository {
  constructor(id_tenant = null) {
    super("tmp_mov_estoque", id_tenant);
  }

  // Métodos personalizados específicos para MovEstoque podem ser adicionados aqui
  // Os métodos básicos (create, update, delete, findAll, findById, etc.)
  // já estão disponíveis através da herança da Repository
}

export { MovEstoqueRepository };