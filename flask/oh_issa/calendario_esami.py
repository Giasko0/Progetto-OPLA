from flask import Blueprint, request, jsonify, Response
from db import get_db_connection, release_connection
from psycopg2.extras import DictCursor
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter
from io import BytesIO
from datetime import datetime
import logging

calendario_esami_bp = Blueprint('calendario_esami', __name__, url_prefix='/api/oh-issa')

# API per ottenere i curriculum per un corso di studi e anno
@calendario_esami_bp.route('/get-curriculum-by-cds')
def get_curriculum_by_cds():
    try:
        cds_code = request.args.get('cds')
        anno_accademico = request.args.get('anno')
        
        if not cds_code or not anno_accademico:
            return jsonify({'error': 'Parametri mancanti'})
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        cursor.execute("""
            SELECT DISTINCT curriculum_codice, curriculum_nome
            FROM cds
            WHERE codice = %s AND anno_accademico = %s
            ORDER BY curriculum_codice
        """, (cds_code, anno_accademico))
        
        curriculum_list = [{'codice': row['curriculum_codice'], 'nome': row['curriculum_nome']} for row in cursor.fetchall()]
        
        return jsonify(curriculum_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere i dati del calendario esami
@calendario_esami_bp.route('/get-calendario-esami')
def get_calendario_esami():
  try:
    cds_code = request.args.get('cds')
    anno_accademico = request.args.get('anno')
    curriculum = request.args.get('curriculum')
    
    if not cds_code or not anno_accademico or not curriculum:
      return jsonify({'error': 'Parametri mancanti'})
    
    # Connessione al database
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    # Ottieni i dettagli del corso di studi
    cursor.execute("""
      SELECT nome_corso, curriculum_codice, curriculum_nome
      FROM cds
      WHERE codice = %s AND anno_accademico = %s AND curriculum_codice = %s
    """, (cds_code, anno_accademico, curriculum))
    
    cds_info = cursor.fetchone()
    if not cds_info:
      return jsonify({'error': 'Corso di studi non trovato'})
    
    # Ottieni tutti gli insegnamenti e le loro informazioni
    cursor.execute("""
      SELECT i.id, i.codice, i.titolo, ic.anno_corso, ic.semestre, 
             ic.curriculum_codice, ic.inserire_esami, ic.master
      FROM insegnamenti i
      JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
      WHERE ic.cds = %s AND ic.anno_accademico = %s 
        AND (ic.curriculum_codice = %s OR ic.curriculum_codice = 'GEN')
      ORDER BY ic.anno_corso, i.titolo
    """, (cds_code, anno_accademico, curriculum))
    
    insegnamenti_base = cursor.fetchall()
    
    # Ottieni gli esami diretti (per insegnamenti con inserire_esami = TRUE)
    cursor.execute("""
      SELECT e.insegnamento, e.data_appello
      FROM esami e
      JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento
      WHERE e.cds = %s AND e.anno_accademico = %s
        AND e.curriculum_codice IN (%s, 'GEN')
        AND e.data_appello >= %s
        AND e.mostra_nel_calendario = TRUE
        AND ic.cds = %s AND ic.anno_accademico = %s
        AND (ic.curriculum_codice = %s OR ic.curriculum_codice = 'GEN')
        AND (ic.inserire_esami = TRUE OR ic.master IS NULL)
      ORDER BY e.data_appello
    """, (cds_code, anno_accademico, curriculum, f"{anno_accademico}-01-01",
          cds_code, anno_accademico, curriculum))
    
    esami_diretti = cursor.fetchall()
    
    # Ottieni gli esami dal master (per insegnamenti con inserire_esami = FALSE)
    cursor.execute("""
      SELECT ic.insegnamento, e.data_appello
      FROM insegnamenti_cds ic
      JOIN esami e ON ic.master = e.insegnamento
      WHERE ic.cds = %s AND ic.anno_accademico = %s
        AND (ic.curriculum_codice = %s OR ic.curriculum_codice = 'GEN')
        AND ic.inserire_esami = FALSE
        AND ic.master IS NOT NULL
        AND e.anno_accademico = %s
        AND e.mostra_nel_calendario = TRUE
      ORDER BY e.data_appello
    """, (cds_code, anno_accademico, curriculum, anno_accademico))
    
    esami_master = cursor.fetchall()
    
    # Combina gli esami in un dizionario per insegnamento
    esami_per_insegnamento = {}
    
    # Aggiungi esami diretti
    for esame in esami_diretti:
      if esame['insegnamento'] not in esami_per_insegnamento:
        esami_per_insegnamento[esame['insegnamento']] = []
      esami_per_insegnamento[esame['insegnamento']].append({
        'data_appello': esame['data_appello']
      })
    
    # Aggiungi esami dal master
    for esame in esami_master:
      if esame['insegnamento'] not in esami_per_insegnamento:
        esami_per_insegnamento[esame['insegnamento']] = []
      esami_per_insegnamento[esame['insegnamento']].append({
        'data_appello': esame['data_appello']
      })
    
    # Costruisci la lista finale degli insegnamenti
    insegnamenti = []
    for row in insegnamenti_base:
      insegnamento_id = row['id']
      insegnamenti.append({
        'id': insegnamento_id,
        'codice': row['codice'],
        'titolo': row['titolo'],
        'anno_corso': row['anno_corso'],
        'semestre': row['semestre'],
        'curriculum_codice': row['curriculum_codice'],
        'esami': esami_per_insegnamento.get(insegnamento_id, [])
      })
    
    # Query per ottenere le sessioni
    cursor.execute("""
      SELECT tipo_sessione, inizio, fine
      FROM sessioni
      WHERE cds = %s AND anno_accademico = %s 
        AND (curriculum_codice = %s OR curriculum_codice = 'GEN')
      ORDER BY inizio
    """, (cds_code, anno_accademico, curriculum))
    
    sessioni = cursor.fetchall()
    
    # Prepara le sessioni per il calendario
    sessioni_calendario = {
      'anticipata': {'nome': 'Sessione Anticipata', 'inizio': None, 'fine': None},
      'estiva': {'nome': 'Sessione Estiva', 'inizio': None, 'fine': None},
      'autunnale': {'nome': 'Sessione Autunnale', 'inizio': None, 'fine': None},
      'invernale': {'nome': 'Sessione Invernale', 'inizio': None, 'fine': None}
    }
    
    # Popola le date delle sessioni
    for sessione in sessioni:
      tipo_sessione, inizio, fine = sessione
      if tipo_sessione in sessioni_calendario:
        sessioni_calendario[tipo_sessione]['inizio'] = inizio
        sessioni_calendario[tipo_sessione]['fine'] = fine
    
    # Se non c'è sessione anticipata, cerca quella invernale dell'anno precedente
    if not sessioni_calendario['anticipata']['inizio']:
      cursor.execute("""
        SELECT inizio, fine
        FROM sessioni
        WHERE cds = %s AND anno_accademico = %s AND tipo_sessione = 'invernale'
          AND (curriculum_codice = %s OR curriculum_codice = 'GEN')
      """, (cds_code, int(anno_accademico) - 1, curriculum))
      
      sessione_precedente = cursor.fetchone()
      if sessione_precedente:
        sessioni_calendario['anticipata']['inizio'] = sessione_precedente[0]
        sessioni_calendario['anticipata']['fine'] = sessione_precedente[1]
    
    return jsonify({
      'nome_corso': cds_info['nome_corso'],
      'curriculum': cds_info['curriculum_nome'],
      'insegnamenti': insegnamenti,
      'sessioni': sessioni_calendario
    })
  except Exception as e:
    return jsonify({"error": str(e)}), 500
  finally:
    if 'cursor' in locals() and cursor:
      cursor.close()
    if 'conn' in locals() and conn:
      release_connection(conn)

# API per esportare il calendario esami in formato XLSX
@calendario_esami_bp.route('/esporta-calendario-esami')
def esporta_calendario_esami():
    try:
        cds_code = request.args.get('cds')
        anno_accademico_str = request.args.get('anno')
        curriculum = request.args.get('curriculum')
        
        if not all([cds_code, anno_accademico_str, curriculum]):
            return jsonify({'error': 'Parametri mancanti'}), 400
        
        try:
            anno_accademico = int(anno_accademico_str)
        except ValueError:
            return jsonify({'error': 'Anno accademico non valido'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        # Info corso
        cursor.execute("""
            SELECT nome_corso, curriculum_codice, curriculum_nome 
            FROM cds
            WHERE codice = %s AND anno_accademico = %s AND curriculum_codice = %s
        """, (cds_code, anno_accademico, curriculum))
        
        cds_info = cursor.fetchone()
        if not cds_info:
            return jsonify({'error': 'Corso di studi non trovato'}), 404
        # Ottieni insegnamenti base
        cursor.execute("""
            SELECT i.id, i.codice, i.titolo, ic.anno_corso, ic.semestre, 
                   ic.curriculum_codice, ic.inserire_esami, ic.master
            FROM insegnamenti i
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            WHERE ic.cds = %s AND ic.anno_accademico = %s 
              AND (ic.curriculum_codice = %s OR ic.curriculum_codice = 'GEN')
            ORDER BY ic.anno_corso, i.titolo
        """, (cds_code, anno_accademico, curriculum))
        
        insegnamenti_base = cursor.fetchall()

        # Ottieni esami diretti
        cursor.execute("""
            SELECT e.insegnamento, e.data_appello
            FROM esami e
            JOIN insegnamenti_cds ic ON e.insegnamento = ic.insegnamento
            WHERE e.cds = %s AND e.anno_accademico = %s
              AND e.curriculum_codice IN (%s, 'GEN')
              AND e.data_appello >= %s
              AND e.mostra_nel_calendario = TRUE
              AND ic.cds = %s AND ic.anno_accademico = %s
              AND (ic.curriculum_codice = %s OR ic.curriculum_codice = 'GEN')
              AND (ic.inserire_esami = TRUE OR ic.master IS NULL)
            ORDER BY e.data_appello
        """, (cds_code, anno_accademico, curriculum, f"{anno_accademico}-01-01",
              cds_code, anno_accademico, curriculum))
        
        esami_diretti = cursor.fetchall()

        # Ottieni esami dal master
        cursor.execute("""
            SELECT ic.insegnamento, e.data_appello
            FROM insegnamenti_cds ic
            JOIN esami e ON ic.master = e.insegnamento
            WHERE ic.cds = %s AND ic.anno_accademico = %s
              AND (ic.curriculum_codice = %s OR ic.curriculum_codice = 'GEN')
              AND ic.inserire_esami = FALSE
              AND ic.master IS NOT NULL
              AND e.anno_accademico = %s
              AND e.mostra_nel_calendario = TRUE
            ORDER BY e.data_appello
        """, (cds_code, anno_accademico, curriculum, anno_accademico))
        
        esami_master = cursor.fetchall()

        # Query per le sessioni
        cursor.execute("""
            SELECT tipo_sessione, inizio, fine
            FROM sessioni
            WHERE cds = %s AND anno_accademico = %s 
              AND (curriculum_codice = %s OR curriculum_codice = 'GEN')
            ORDER BY inizio
        """, (cds_code, anno_accademico, curriculum))
        
        sessioni = cursor.fetchall()
        
        sessioni_dict = {s['tipo_sessione']: {'inizio': s['inizio'], 'fine': s['fine']} for s in sessioni}
        
        sessioni_calendario = {
            'anticipata': {'nome': 'Sessione Anticipata', 'inizio': None, 'fine': None},
            'estiva': {'nome': 'Sessione Estiva', 'inizio': None, 'fine': None},
            'autunnale': {'nome': 'Sessione Autunnale', 'inizio': None, 'fine': None},
            'invernale': {'nome': 'Sessione Invernale', 'inizio': None, 'fine': None}
        }
        
        for tipo_sessione, data_sessione in sessioni_dict.items():
            if tipo_sessione in sessioni_calendario:
                sessioni_calendario[tipo_sessione].update(data_sessione)
        
        # Combina esami per insegnamento
        esami_per_insegnamento = {}
        
        for esame in esami_diretti:
            if esame['insegnamento'] not in esami_per_insegnamento:
                esami_per_insegnamento[esame['insegnamento']] = []
            esami_per_insegnamento[esame['insegnamento']].append({'data_appello': esame['data_appello']})
        
        for esame in esami_master:
            if esame['insegnamento'] not in esami_per_insegnamento:
                esami_per_insegnamento[esame['insegnamento']] = []
            esami_per_insegnamento[esame['insegnamento']].append({'data_appello': esame['data_appello']})
        
        # Costruisci lista insegnamenti finale
        insegnamenti = []
        for row in insegnamenti_base:
            insegnamenti.append({
                'id': row['id'],
                'codice': row['codice'],
                'titolo': row['titolo'],
                'anno_corso': row['anno_corso'],
                'semestre': row['semestre'],
                'curriculum_codice': row['curriculum_codice'],
                'esami': esami_per_insegnamento.get(row['id'], [])
            })
        
        # Raggruppa gli insegnamenti per anno di corso
        insegnamenti_per_anno = {}
        for ins in insegnamenti:
            anno = ins['anno_corso'] or 1
            insegnamenti_per_anno.setdefault(anno, []).append(ins)
        
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = f"Calendario {cds_code} {anno_accademico}"
        
        header_font = Font(bold=True, size=14, name="Arial")
        year_header_font = Font(bold=True, size=16, color="FFFFFF", name="Arial")
        insegnamento_font = Font(bold=False, size=12, name="Arial")
        center_alignment = Alignment(horizontal='center', vertical='center')
        left_alignment = Alignment(horizontal='left', vertical='center')
        center_wrap_alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        year_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
        first_semester_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
        blue_fill = PatternFill(start_color="BDD7EE", end_color="BDD7EE", fill_type="solid")
        
        current_row = 1
        ordine_sessioni = ['anticipata', 'estiva', 'autunnale', 'invernale']
        
        for anno_corso in sorted(insegnamenti_per_anno.keys()):
            if not insegnamenti_per_anno[anno_corso]:
                continue
            
            num_colonne_sessioni = sum(1 for tipo in ordine_sessioni 
                                     if tipo in sessioni_dict and sessioni_calendario[tipo]['inizio'])
            total_columns = 1 + num_colonne_sessioni
            
            year_cell = sheet.cell(row=current_row, column=1, value=f"{anno_corso}° Anno")
            year_cell.font = year_header_font
            year_cell.alignment = center_alignment
            year_cell.fill = year_fill
            year_cell.border = thin_border
            
            end_col = min(total_columns, 26)
            sheet.merge_cells(f'A{current_row}:{get_column_letter(end_col)}{current_row}')
            current_row += 1
            
            insegnamento_cell = sheet.cell(row=current_row, column=1, value='INSEGNAMENTO')
            insegnamento_cell.font = header_font
            insegnamento_cell.alignment = center_alignment
            insegnamento_cell.fill = header_fill
            insegnamento_cell.border = thin_border
            
            current_col = 2
            for tipo_sessione in ordine_sessioni:
                if tipo_sessione in sessioni_dict and sessioni_calendario[tipo_sessione]['inizio']:
                    session_cell = sheet.cell(row=current_row, column=current_col, 
                                            value=sessioni_calendario[tipo_sessione]['nome'].upper())
                    session_cell.font = header_font
                    session_cell.alignment = center_alignment
                    session_cell.fill = header_fill
                    session_cell.border = thin_border
                    current_col += 1
            
            current_row += 1
            
            col_positions = [1]
            data_col = 2
            for tipo_sessione in ordine_sessioni:
                if tipo_sessione in sessioni_dict and sessioni_calendario[tipo_sessione]['inizio']:
                    col_positions.append(data_col)
                    data_col += 1
            
            for insegnamento in insegnamenti_per_anno[anno_corso]:
                name_cell = sheet.cell(row=current_row, column=1, value=insegnamento['titolo'])
                name_cell.alignment = left_alignment
                name_cell.font = insegnamento_font
                name_cell.border = thin_border

                if insegnamento.get('semestre') == 1:
                    name_cell.fill = first_semester_fill

                col_index = 0
                for tipo_sessione in ordine_sessioni:
                    if tipo_sessione in sessioni_dict and sessioni_calendario[tipo_sessione]['inizio']:
                        col_index += 1

                        # Esami normali (mostra_nel_calendario = TRUE)
                        esami_sessione = [
                            esame for esame in insegnamento['esami']
                            if sessioni_calendario[tipo_sessione]['inizio'] <= esame['data_appello'] <= sessioni_calendario[tipo_sessione]['fine']
                        ]

                        # Esami annuali e sessione anticipata: cerca anche quelli con mostra_nel_calendario = FALSE
                        esami_nascosti = []
                        if (
                            insegnamento.get('semestre') == 3 and tipo_sessione == 'anticipata'
                        ):
                            cursor.execute("""
                                SELECT e.data_appello
                                FROM esami e
                                WHERE e.insegnamento = %s
                                  AND e.cds = %s
                                  AND e.anno_accademico = %s
                                  AND (e.curriculum_codice = %s OR e.curriculum_codice = 'GEN')
                                  AND e.data_appello >= %s
                                  AND e.data_appello BETWEEN %s AND %s
                                  AND e.mostra_nel_calendario = FALSE
                            """, (
                                insegnamento['id'],
                                cds_code,
                                anno_accademico,
                                insegnamento['curriculum_codice'],
                                f"{anno_accademico}-01-01",
                                sessioni_calendario[tipo_sessione]['inizio'],
                                sessioni_calendario[tipo_sessione]['fine']
                            ))
                            esami_nascosti = [row['data_appello'] for row in cursor.fetchall()]

                        if esami_sessione:
                            esami_sessione.sort(key=lambda x: x['data_appello'])
                            date_formattate = [esame['data_appello'].strftime('%d/%m/%Y') for esame in esami_sessione]
                            date_complete = '\n'.join(date_formattate)
                            if col_index < len(col_positions):
                                date_cell = sheet.cell(row=current_row, column=col_positions[col_index], value=date_complete)
                                date_cell.alignment = center_wrap_alignment
                                date_cell.border = thin_border
                                if insegnamento.get('semestre') == 1:
                                    date_cell.fill = first_semester_fill
                        else:
                            if col_index < len(col_positions):
                                empty_cell = sheet.cell(row=current_row, column=col_positions[col_index], value="--")
                                empty_cell.alignment = center_alignment
                                empty_cell.border = thin_border
                                if insegnamento.get('semestre') == 1:
                                    empty_cell.fill = first_semester_fill

                        # Se ci sono esami nascosti, stampali in blu (aggiungi alle date normali, sotto)
                        if esami_nascosti and col_index < len(col_positions):
                            cell = sheet.cell(row=current_row, column=col_positions[col_index])
                            # Se la cella contiene già date normali, aggiungi le blu sotto
                            value = cell.value if cell.value and cell.value != "--" else ""
                            blu_dates = [d.strftime('%d/%m/%Y') for d in sorted(esami_nascosti)]
                            if value:
                                value += "\n"
                            value += "\n".join(blu_dates)
                            cell.value = value
                            cell.fill = blue_fill
                            cell.alignment = center_wrap_alignment
                            cell.border = thin_border

                current_row += 1
            
            current_row += 1
        
        sheet.column_dimensions['A'].width = 60
        for col_num in range(2, data_col):
            sheet.column_dimensions[get_column_letter(col_num)].width = 40
        
        for row_num in range(1, current_row):
            sheet.row_dimensions[row_num].height = 45
        
        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        
        file_size = len(output.getvalue())
        if file_size == 0:
            return jsonify({'error': 'Errore nella generazione del file Excel'}), 500
        
        filename = f"calendario_esami_{cds_code}_{anno_accademico_str}_{curriculum.replace(' ', '_').replace('/', '_')}.xlsx"
        
        return Response(
            output.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Length': str(file_size)
            }
        )
        
    except Exception as e:
        logging.error(f"Errore durante l'esportazione XLSX: {str(e)}", exc_info=True)
        return jsonify({"error": f"Errore interno del server: {str(e)}"}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)