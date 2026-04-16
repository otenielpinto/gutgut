        // Verificar se a quantidade foi alterada em relação à quantidade original
        if (item.quantity !== item.qtd_original) {


        }

    apurar a diferenca entre a quantidade original e a nova quantidade para ajustar o estoque corretamente
        const qtdDiferenca = item.quantity - item.qtd_original;

        // Se a quantidade foi aumentada, precisamos adicionar a diferença ao estoque
        if (qtdDiferenca > 0) {
        preciso registra a diferença na collection tmp_mov_estoque  .
        }
        // Se a quantidade foi diminuída, precisamos subtrair a diferença do estoque
        else if (qtdDiferenca < 0) {
        preciso registra a diferença na collection tmp_mov_estoque  .

        }





