import { useState, useEffect } from 'react';
import dadosAcoes from '../../data/dados_normalizados.json';

export function SimuladorAcoes() {
  // Estados para o fluxo completo
  const [etapa, setEtapa] = useState(1);
  const [valoresSelecionados, setValoresSelecionados] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [acoes, setAcoes] = useState([]);
  const [erro, setErro] = useState('');
  
  // Estados para datas
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  
  // Estados para investimentos
  const [investimentos, setInvestimentos] = useState({});
  
  // Estados para resultados da simulação
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Carrega os dados do JSON
  useEffect(() => {
    if (dadosAcoes && dadosAcoes.stocks) {
      setAcoes(dadosAcoes.stocks);
      
      // Define datas padrão (30 dias atrás até hoje)
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);
      
      setDataInicial(trintaDiasAtras.toISOString().split('T')[0]);
      setDataFinal(hoje.toISOString().split('T')[0]);
    }
  }, []);

  // Etapa 1: Seleção de ações e datas
  const adicionarAcao = () => {
    if (inputValue) {
      const acaoEncontrada = acoes.find(acao => 
        acao.stock === inputValue || 
        (acao.name && acao.name.toLowerCase().includes(inputValue.toLowerCase()))
      );
      
      if (acaoEncontrada && !valoresSelecionados.includes(acaoEncontrada.stock)) {
        setValoresSelecionados([...valoresSelecionados, acaoEncontrada.stock]);
        setInputValue('');
        setErro('');
      } else if (!acaoEncontrada) {
        setErro('Ação não encontrada.');
      }
    }
  };

  const removerAcao = (simbolo) => {
    setValoresSelecionados(valoresSelecionados.filter(item => item !== simbolo));
  };

  const avancarEtapa1 = () => {
    if (valoresSelecionados.length === 0) {
      setErro('Selecione pelo menos uma ação!');
      return;
    }
    if (!dataInicial || !dataFinal) {
      setErro('Selecione ambas as datas!');
      return;
    }
    if (new Date(dataInicial) >= new Date(dataFinal)) {
      setErro('Data inicial deve ser anterior à data final!');
      return;
    }
    
    setEtapa(2);
    setErro('');
  };

  // Etapa 2: Definição de investimentos
  const handleInvestimentoChange = (simbolo, valor) => {
    setInvestimentos(prev => ({
      ...prev,
      [simbolo]: parseFloat(valor) || 0
    }));
  };

  const avancarEtapa2 = () => {
    const totalInvestido = valoresSelecionados.reduce((total, simbolo) => {
      return total + (investimentos[simbolo] || 0);
    }, 0);
    
    if (totalInvestido === 0) {
      setErro('Defina o investimento para pelo menos uma ação!');
      return;
    }
    
    setEtapa(3);
    setErro('');
    simularInvestimentos();
  };

  // Função para buscar dados do Yahoo Finance (corrigida)
  const buscarDadosYahooFinance = async (simbolo, dataInicio, dataFim) => {
    try {
      // Formatar símbolo para Yahoo Finance (garante .SA)
      const simboloFormatado = simbolo.includes('.SA') ? simbolo : `${simbolo}.SA`;

      // timestamps em segundos
      const period1 = Math.floor(new Date(dataInicio).getTime() / 1000);
      // adicionar 1 dia a period2 para garantir inclusão da dataFinal (hora 00:00 -> pode excluir último candle)
      const period2 = Math.floor(new Date(dataFim).getTime() / 1000) + 24*3600;

      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simboloFormatado)}?period1=${period1}&period2=${period2}&interval=1d`
      );
      
      const payload = await response.json();

      // verificar estrutura
      const result = payload?.chart?.result?.[0];
      if (!result) throw new Error('Resposta inválida do Yahoo Finance');

      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      const closes = Array.isArray(quotes.close) ? quotes.close : [];

      // Encontra primeiro e último índices com fechamento válido
      const firstIndex = closes.findIndex(p => p !== null && p !== undefined);
      let lastIndex = -1;
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] !== null && closes[i] !== undefined) {
          lastIndex = i;
          break;
        }
      }

      if (firstIndex === -1 || lastIndex === -1) {
        // fallback se não houver preços válidos
        throw new Error('Sem preços válidos no período retornado');
      }

      const precoInicial = closes[firstIndex];
      const precoFinal = closes[lastIndex];

      // Montar histórico filtrado (sem valores nulos)
      const dadosHistorico = timestamps.map((t, idx) => ({
        data: new Date(t * 1000),
        preco: closes[idx] !== null && closes[idx] !== undefined ? closes[idx] : null
      })).filter(row => row.preco !== null);

      // Simular dividendos (ainda uma aproximação; melhor reintegrar endpoint de dividends quando quiser)
      const dividendosPorAcao = precoInicial * (Math.random() * 0.05); // 0-5% do valor como dividendos

      return {
        precoInicial,
        precoFinal,
        dividendosPorAcao,
        dadosHistorico
      };
    } catch (error) {
      console.error(`Erro ao buscar dados para ${simbolo}:`, error);

      // Fallback para dados mockados se a API falhar
      const precoInicial = 20 + Math.random() * 80; // 20-100
      const precoFinal = precoInicial * (1 + (Math.random() * 0.5 - 0.1));
      const dividendosPorAcao = precoInicial * (Math.random() * 0.05);

      return {
        precoInicial,
        precoFinal,
        dividendosPorAcao,
        dadosHistorico: []
      };
    }
  };

  // Etapa 3: Simulação
  const simularInvestimentos = async () => {
    setCarregando(true);
    
    const resultadosSimulados = [];
    
    for (const simbolo of valoresSelecionados) {
      const investimento = investimentos[simbolo] || 0;
      const acao = acoes.find(a => a.stock === simbolo);
      
      // Buscar dados reais do Yahoo Finance
      const dadosYahoo = await buscarDadosYahooFinance(simbolo, dataInicial, dataFinal);
      
      let precoInicial = dadosYahoo.precoInicial;
      let precoFinal = dadosYahoo.precoFinal;
      const dividendosPorAcao = dadosYahoo.dividendosPorAcao || 0;

      // Proteções caso API devolva undefined
      if (!precoInicial || !precoFinal || precoInicial <= 0) {
        // fallback simples
        precoInicial = precoInicial || 1;
        precoFinal = precoFinal || precoInicial;
      }
      
      const quantidadeAcoes = Math.floor(investimento / precoInicial);
      const valorInicial = quantidadeAcoes * precoInicial;
      const valorFinal = quantidadeAcoes * precoFinal;
      const valorDividendos = quantidadeAcoes * dividendosPorAcao;
      const lucroApreciacao = valorFinal - valorInicial;
      const lucroTotal = lucroApreciacao + valorDividendos;

      // Evita divisão por zero quando valorInicial === 0
      const porcentagemLucro = valorInicial > 0
        ? ((valorFinal + valorDividendos) / valorInicial - 1) * 100
        : 0;
      
      resultadosSimulados.push({
        simbolo,
        nome: acao?.name || simbolo,
        investimento,
        precoInicial: parseFloat(precoInicial.toFixed(2)),
        precoFinal: parseFloat(precoFinal.toFixed(2)),
        quantidadeAcoes,
        valorInicial: parseFloat(valorInicial.toFixed(2)),
        valorFinal: parseFloat(valorFinal.toFixed(2)),
        valorDividendos: parseFloat(valorDividendos.toFixed(2)),
        lucroApreciacao: parseFloat(lucroApreciacao.toFixed(2)),
        lucroTotal: parseFloat(lucroTotal.toFixed(2)),
        porcentagemLucro: parseFloat(porcentagemLucro.toFixed(2)),
        dadosHistorico: dadosYahoo.dadosHistorico
      });
    }
    
    // pequenas transições visuais
    setTimeout(() => {
      setResultados(resultadosSimulados);
      setCarregando(false);
    }, 700);
  };

  const voltarEtapa = () => {
    setEtapa(prev => prev - 1);
    setErro('');
  };

  const reiniciar = () => {
    setEtapa(1);
    setValoresSelecionados([]);
    setInvestimentos({});
    setResultados([]);
    setErro('');
  };

  const encontrarNomeAcao = (simbolo) => {
    const acao = acoes.find(item => item.stock === simbolo);
    return acao ? acao.name : simbolo;
  };

  // Componente de gráfico simples
  const GraficoAcao = ({ resultado }) => {
    const lucroPercentual = resultado.porcentagemLucro;
    const cor = lucroPercentual >= 0 ? '#28a745' : '#dc3545';
    
    return (
      <div className="card h-100">
        <div className="card-body">
          <h6 className="card-title">{resultado.simbolo}</h6>
          <div className="d-flex align-items-end justify-content-center" style={{ height: '120px' }}>
            <div 
              className="mx-2 d-flex flex-column align-items-center"
              style={{ width: '60px' }}
            >
              <div 
                style={{ 
                  height: `${Math.min(Math.abs(lucroPercentual) * 2, 100)}px`,
                  backgroundColor: cor,
                  width: '40px',
                  borderRadius: '4px'
                }}
              ></div>
              <small className="mt-1 text-center">
                {lucroPercentual >= 0 ? '📈' : '📉'} {lucroPercentual.toFixed(1)}%
              </small>
            </div>
          </div>
          <div className="mt-2 text-center">
            <small className={`fw-bold ${lucroPercentual >= 0 ? 'text-success' : 'text-danger'}`}>
              {lucroPercentual >= 0 ? 'LUCRO' : 'PREJUÍZO'}
            </small>
          </div>
        </div>
      </div>
    );
  };

  // Cálculos totais
  const totalInvestido = resultados.reduce((sum, item) => sum + item.investimento, 0);
  const totalValorInicial = resultados.reduce((sum, item) => sum + item.valorInicial, 0);
  const totalValorFinal = resultados.reduce((sum, item) => sum + item.valorFinal, 0);
  const totalDividendos = resultados.reduce((sum, item) => sum + item.valorDividendos, 0);
  const totalLucroApreciacao = resultados.reduce((sum, item) => sum + item.lucroApreciacao, 0);
  const totalLucro = resultados.reduce((sum, item) => sum + item.lucroTotal, 0);
  const lucroPercentualTotal = totalValorInicial > 0 ? ((totalValorFinal + totalDividendos) / totalValorInicial - 1) * 100 : 0;

  // Renderização condicional por etapa
  return (
    <div className="container-fluid">
      {/* Header com progresso */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center">
            <h3>Simulador de Investimentos</h3>
            <div className="text-muted">Etapa {etapa} de 3</div>
          </div>
          <div className="progress mb-3">
            <div 
              className="progress-bar" 
              style={{ width: `${(etapa / 3) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Mensagem de erro */}
      {erro && (
        <div className="alert alert-warning alert-dismissible fade show" role="alert">
          {erro}
          <button type="button" className="btn-close" onClick={() => setErro('')}></button>
        </div>
      )}

      {/* ETAPA 1: Seleção de ações e datas */}
      {etapa === 1 && (
        <div className="row justify-content-center">
          <div className="col-12 d-flex justify-content-center">
            <div className="card shadow-lg" style={{ width: '500px' }}>
              <div className="card-header bg-primary text-white py-3">
                <h4 className="mb-0">1. Selecione as Ações e Período</h4>
              </div>
              <div className="card-body p-4"> {/* padding reduzido para deixar mais compacto */}
                {/* Seleção de ações */}
                <div className="mb-4">
                  <label className="form-label fs-6 fw-bold">Buscar Ações:</label>
                  <div className="input-group">
                    <input
                      className="form-control"
                      list="datalistOptions"
                      placeholder="Digite o símbolo ou nome da ação..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && adicionarAcao()}
                    />
                    <button 
                      className="btn btn-primary" 
                      type="button"
                      onClick={adicionarAcao}
                    >
                      Adicionar
                    </button>
                  </div>
                  <datalist id="datalistOptions">
                    {acoes.map((acao, index) => (
                      <option key={index} value={acao.stock}>
                        {acao.name}
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* Ações selecionadas - fix width and vertical stacking */}
                <div className="mb-4">
                  <label className="form-label fs-6 fw-bold">
                    Ações Selecionadas ({valoresSelecionados.length}):
                  </label>
                  <div className="d-flex flex-column gap-2 p-2 bg-light rounded" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {valoresSelecionados.length === 0 ? (
                      <span className="text-muted small">Nenhuma ação selecionada</span>
                    ) : (
                      valoresSelecionados.map((simbolo, index) => (
                        <div key={index} className="d-flex justify-content-between align-items-center bg-primary text-white rounded p-2">
                          <div>
                            <strong style={{fontSize: '0.95rem'}}>{simbolo}</strong>
                            <div className="small text-white-50">{encontrarNomeAcao(simbolo)}</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-light"
                            onClick={() => removerAcao(simbolo)}
                            aria-label="Remover"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Seleção de datas */}
                <div className="row">
                  <div className="col-12 mb-3">
                    <label className="form-label fs-6 fw-bold">Data Inicial:</label>
                    <input
                      type="date"
                      className="form-control"
                      value={dataInicial}
                      onChange={(e) => setDataInicial(e.target.value)}
                    />
                  </div>
                  <div className="col-12 mb-3">
                    <label className="form-label fs-6 fw-bold">Data Final:</label>
                    <input
                      type="date"
                      className="form-control"
                      value={dataFinal}
                      onChange={(e) => setDataFinal(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="card-footer bg-light p-3">
                <button 
                  className="btn btn-success" 
                  onClick={avancarEtapa1}
                  disabled={valoresSelecionados.length === 0}
                >
                  Avançar para Investimentos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ETAPA 2: Definição de investimentos */}
      {etapa === 2 && (
        <div className="row justify-content-center">
          <div className="col-12 d-flex justify-content-center">
            <div className="card shadow-lg" style={{ width: '1000px' }}>
              <div className="card-header bg-info text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0">2. Defina os Investimentos</h5>
                <button className="btn btn-light btn-sm" onClick={voltarEtapa}>
                  ← Voltar
                </button>
              </div>
              <div className="card-body p-4">
                <p className="text-muted mb-3 small">
                  Período selecionado: <strong>{new Date(dataInicial).toLocaleDateString()}</strong> até <strong>{new Date(dataFinal).toLocaleDateString()}</strong>
                </p>

                {/* Cards fixos de 300px, dentro de container de 1000px */}
                <div className="d-flex flex-wrap justify-content-start gap-3" style={{ maxWidth: '1000px' }}>
                  {valoresSelecionados.map((simbolo) => {
                    return (
                      <div key={simbolo} style={{ width: '300px' }}>
                        <div className="card h-100" style={{ minHeight: '160px' }}>
                          <div className="card-body d-flex flex-column justify-content-between">
                            <div>
                              <label className="form-label fw-bold" style={{ fontSize: '1rem' }}>
                                {simbolo}
                              </label>
                              <p className="text-muted small mb-2">{encontrarNomeAcao(simbolo)}</p>
                            </div>
                            <div className="input-group">
                              <span className="input-group-text">R$</span>
                              <input
                                type="number"
                                className="form-control form-control-lg"
                                placeholder="Valor a investir"
                                value={investimentos[simbolo] || ''}
                                onChange={(e) => handleInvestimentoChange(simbolo, e.target.value)}
                                min="0"
                                step="0.01"
                                style={{ fontSize: '1rem', padding: '10px' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
              <div className="card-footer bg-light p-3 d-flex justify-content-end">
                <button 
                  className="btn btn-success"
                  onClick={avancarEtapa2}
                >
                  Simular Investimentos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ETAPA 3: Resultados da simulação */}
      {etapa === 3 && (
        <div className="row">
          <div className="col-12">
            <div className="card shadow-lg">
              <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0">3. Resultados da Simulação</h5>
                <div>
                  <button className="btn btn-light btn-sm me-2" onClick={voltarEtapa}>
                    ← Voltar
                  </button>
                  <button className="btn btn-warning btn-sm" onClick={reiniciar}>
                    ↻ Nova Simulação
                  </button>
                </div>
              </div>
              <div className="card-body p-3">
                {carregando ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" style={{width: '3rem', height: '3rem'}} role="status">
                      <span className="visually-hidden">Carregando...</span>
                    </div>
                    <p className="mt-3">Buscando dados do Yahoo Finance e simulando investimentos...</p>
                  </div>
                ) : (
                  <>
                    {/* Gráficos de performance */}
                    <div className="row mb-3">
                      <div className="col-12">
                        <h5 className="mb-2">📊 Performance das Ações</h5>
                        <div className="row">
                          {resultados.map((resultado, index) => (
                            <div key={index} className="col-md-3 col-sm-6 mb-3">
                              <GraficoAcao resultado={resultado} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Tabela de resultados */}
                    <div className="row">
                      <div className="col-12">
                        <h5 className="mb-2">📋 Resumo Detalhado dos Investimentos</h5>
                        <div className="table-responsive">
                          <table className="table table-striped table-hover">
                            <thead className="table-dark">
                              <tr>
                                <th>Ação</th>
                                <th>Investimento (R$)</th>
                                <th>Preço Inicial (R$)</th>
                                <th>Preço Final (R$)</th>
                                <th>Quantidade</th>
                                <th>Valor Inicial (R$)</th>
                                <th>Valor Final (R$)</th>
                                <th>Dividendos (R$)</th>
                                <th>Lucro Apreciação (R$)</th>
                                <th>Lucro Total (R$)</th>
                                <th>Rentabilidade (%)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {resultados.map((item, index) => (
                                <tr key={index}>
                                  <td>
                                    <strong>{item.simbolo}</strong>
                                    <br />
                                    <small className="text-muted">{item.nome}</small>
                                  </td>
                                  <td className="fw-bold">{item.investimento.toFixed(2)}</td>
                                  <td>{item.precoInicial.toFixed(2)}</td>
                                  <td>{item.precoFinal.toFixed(2)}</td>
                                  <td>{item.quantidadeAcoes}</td>
                                  <td>{item.valorInicial.toFixed(2)}</td>
                                  <td>{item.valorFinal.toFixed(2)}</td>
                                  <td className="text-info fw-bold">{item.valorDividendos.toFixed(2)}</td>
                                  <td className={item.lucroApreciacao >= 0 ? 'text-success' : 'text-danger'}>
                                    {item.lucroApreciacao.toFixed(2)}
                                  </td>
                                  <td className={item.lucroTotal >= 0 ? 'text-success' : 'text-danger'}>
                                    <strong>{item.lucroTotal.toFixed(2)}</strong>
                                  </td>
                                  <td className={item.porcentagemLucro >= 0 ? 'text-success' : 'text-danger'}>
                                    <strong>{item.porcentagemLucro.toFixed(2)}%</strong>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="table-dark">
                              <tr>
                                <th>TOTAL CARTEIRA</th>
                                <th>{totalInvestido.toFixed(2)}</th>
                                <th>-</th>
                                <th>-</th>
                                <th>-</th>
                                <th>{totalValorInicial.toFixed(2)}</th>
                                <th>{totalValorFinal.toFixed(2)}</th>
                                <th className="text-info fw-bold">{totalDividendos.toFixed(2)}</th>
                                <th className={totalLucroApreciacao >= 0 ? 'text-success' : 'text-danger'}>
                                  {totalLucroApreciacao.toFixed(2)}
                                </th>
                                <th className={totalLucro >= 0 ? 'text-success' : 'text-danger'}>
                                  <strong>{totalLucro.toFixed(2)}</strong>
                                </th>
                                <th className={lucroPercentualTotal >= 0 ? 'text-success' : 'text-danger'}>
                                  <strong>{lucroPercentualTotal.toFixed(2)}%</strong>
                                </th>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Resumo final */}
                    <div className={`alert ${totalLucro >= 0 ? 'alert-success' : 'alert-danger'} mt-3`}>
                      <h5 className="alert-heading">
                        {totalLucro >= 0 ? '✅ Lucro na Carteira' : '❌ Prejuízo na Carteira'}
                      </h5>
                      <div className="row mt-2">
                        <div className="col-md-4">
                          <strong>Investimento Inicial Total:</strong><br />
                          <span className="fs-6">R$ {totalValorInicial.toFixed(2)}</span>
                        </div>
                        <div className="col-md-4">
                          <strong>Valor Final + Dividendos:</strong><br />
                          <span className="fs-6">R$ {(totalValorFinal + totalDividendos).toFixed(2)}</span>
                        </div>
                        <div className="col-md-4">
                          <strong>Resultado Final:</strong><br />
                          <span className={`fs-6 ${totalLucro >= 0 ? 'text-success' : 'text-danger'}`}>
                            R$ {totalLucro.toFixed(2)} ({lucroPercentualTotal.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                      <hr />
                      <div className="row">
                        <div className="col-md-6">
                          <small>💹 Apreciação: R$ {totalLucroApreciacao.toFixed(2)}</small>
                        </div>
                        <div className="col-md-6">
                          <small>💰 Dividendos: R$ {totalDividendos.toFixed(2)}</small>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
