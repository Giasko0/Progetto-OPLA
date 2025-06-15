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

@calendario_esami_bp.route('/getCdSByAnno')
def get_cds_by_anno():
    try:
        anno_accademico = request.args.get('anno')
        if not anno_accademico:
            return jsonify({'error': 'Parametro anno mancante'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        # Seleziona codice e nome_corso distinti.
        cursor.execute("""
            SELECT DISTINCT codice, nome_corso
            FROM cds
            WHERE anno_accademico = %s
            ORDER BY codice, nome_corso
        """, (anno_accademico,))
        
        corsi = cursor.fetchall()
        return jsonify(corsi)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere i curriculum per un corso di studi e anno
@calendario_esami_bp.route('/getCurriculumByCds')
def get_curriculum_by_cds():
    try:
        cds_code = request.args.get('cds')
        anno_accademico = request.args.get('anno')
        
        if not cds_code or not anno_accademico:
            return jsonify({'error': 'Parametri mancanti'})
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=DictCursor)
        
        cursor.execute("""
            SELECT DISTINCT curriculum
            FROM cds
            WHERE codice = %s AND anno_accademico = %s
            ORDER BY curriculum
        """, (cds_code, anno_accademico))
        
        curriculum_list = [row['curriculum'] for row in cursor.fetchall()]
        
        return jsonify(curriculum_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            release_connection(conn)

# API per ottenere i dati del calendario esami
@calendario_esami_bp.route('/getCalendarioEsami')
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
      SELECT nome_corso, curriculum
      FROM cds
      WHERE codice = %s AND anno_accademico = %s AND curriculum = %s
    """, (cds_code, anno_accademico, curriculum))
    
    cds_info = cursor.fetchone()
    if not cds_info:
      return jsonify({'error': 'Corso di studi non trovato'})
    
    # Ottieni tutti gli insegnamenti per il curriculum selezionato + curriculum generale
    # Filtra solo gli esami con mostra_nel_calendario = TRUE
    cursor.execute("""
      SELECT i.id, i.codice, i.titolo, ic.anno_corso, ic.semestre, ic.curriculum,
           COALESCE(e.data_appello, NULL) as data_appello
      FROM insegnamenti i
      JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
      LEFT JOIN esami e ON i.id = e.insegnamento
                        AND e.cds = %s
                        AND e.anno_accademico = %s
                        AND e.curriculum IN (%s, (SELECT curriculum FROM cds WHERE codice = %s AND anno_accademico = %s AND curriculum ILIKE '%%gener%%' LIMIT 1))
                        AND e.data_appello >= %s
                        AND e.mostra_nel_calendario = TRUE
      WHERE ic.cds = %s AND ic.anno_accademico = %s 
        AND (ic.curriculum = %s OR ic.curriculum ILIKE '%%gener%%')
      ORDER BY ic.anno_corso, i.titolo
    """, (cds_code, anno_accademico, curriculum, cds_code, anno_accademico, f"{anno_accademico}-01-01", 
          cds_code, anno_accademico, curriculum))
    
    insegnamenti_raw = cursor.fetchall()
    
    # Raggruppa gli insegnamenti per evitare duplicazioni
    insegnamenti = []
    esami_per_insegnamento = {}
    
    for row in insegnamenti_raw:
      id_insegnamento = row['id']
      if id_insegnamento not in esami_per_insegnamento:
        insegnamenti.append({
          'id': id_insegnamento,
          'codice': row['codice'],
          'titolo': row['titolo'],
          'anno_corso': row['anno_corso'],
          'semestre': row['semestre'],
          'curriculum': row['curriculum'],
          'esami': []
        })
        esami_per_insegnamento[id_insegnamento] = insegnamenti[-1]['esami']
      
      # Aggiungi l'esame se c'è una data
      if row['data_appello']:
        esami_per_insegnamento[id_insegnamento].append({
          'data_appello': row['data_appello']
        })
    
    # Ottieni le sessioni di esame per questo CdS e curriculum
    cursor.execute("""
      SELECT tipo_sessione, inizio, fine
      FROM sessioni
      WHERE cds = %s AND anno_accademico = %s 
        AND (curriculum = %s OR curriculum ILIKE '%%gener%%')
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
          AND (curriculum = %s OR curriculum ILIKE '%%gener%%')
      """, (cds_code, int(anno_accademico) - 1, curriculum))
      
      sessione_precedente = cursor.fetchone()
      if sessione_precedente:
        sessioni_calendario['anticipata']['inizio'] = sessione_precedente[0]
        sessioni_calendario['anticipata']['fine'] = sessione_precedente[1]
    
    return jsonify({
      'nome_corso': cds_info['nome_corso'],
      'curriculum': cds_info['curriculum'],
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
@calendario_esami_bp.route('/esportaCalendarioEsami')
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
        
        cursor.execute("""
            SELECT nome_corso, curriculum FROM cds
            WHERE codice = %s AND anno_accademico = %s AND curriculum = %s
        """, (cds_code, anno_accademico, curriculum))
        
        cds_info = cursor.fetchone()
        if not cds_info:
            return jsonify({'error': 'Corso di studi non trovato'}), 404
        
        cursor.execute("""
            SELECT i.id, i.codice, i.titolo, ic.anno_corso, ic.semestre, ic.curriculum,
                   COALESCE(e.data_appello, NULL) as data_appello
            FROM insegnamenti i
            JOIN insegnamenti_cds ic ON i.id = ic.insegnamento
            LEFT JOIN esami e ON i.id = e.insegnamento
                              AND e.cds = %s AND e.anno_accademico = %s
                              AND e.curriculum IN (%s, (SELECT curriculum FROM cds WHERE codice = %s AND anno_accademico = %s AND curriculum ILIKE '%%gener%%' LIMIT 1))
                              AND e.data_appello >= %s AND e.mostra_nel_calendario = TRUE
            WHERE ic.cds = %s AND ic.anno_accademico = %s 
              AND (ic.curriculum = %s OR ic.curriculum ILIKE '%%gener%%')
            ORDER BY ic.anno_corso, i.titolo
        """, (cds_code, anno_accademico, curriculum, cds_code, anno_accademico, f"{anno_accademico}-01-01", 
              cds_code, anno_accademico, curriculum))
        
        insegnamenti_raw = cursor.fetchall()
        
        cursor.execute("""
            SELECT tipo_sessione, inizio, fine FROM sessioni
            WHERE cds = %s AND anno_accademico = %s 
              AND (curriculum = %s OR curriculum ILIKE '%%gener%%')
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
        
        insegnamenti = []
        esami_per_insegnamento = {}
        
        for row in insegnamenti_raw:
            id_insegnamento = row['id']
            if id_insegnamento not in esami_per_insegnamento:
                insegnamenti.append({
                    'id': id_insegnamento,
                    'codice': row['codice'],
                    'titolo': row['titolo'],
                    'anno_corso': row['anno_corso'],
                    'semestre': row['semestre'],
                    'curriculum': row['curriculum'],
                    'esami': []
                })
                esami_per_insegnamento[id_insegnamento] = insegnamenti[-1]['esami']
            
            if row['data_appello']:
                esami_per_insegnamento[id_insegnamento].append({'data_appello': row['data_appello']})
        
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
        
        current_row = 1
        ordine_sessioni = ['anticipata', 'estiva', 'autunnale', 'invernale']
        
        for anno_corso in sorted(insegnamenti_per_anno.keys()):
            if not insegnamenti_per_anno[anno_corso]:
                continue
            
            num_colonne_sessioni = sum(1 for tipo in ordine_sessioni 
                                     if tipo in sessioni_dict and sessioni_calendario[tipo]['inizio'])
            total_columns = 1 + num_colonne_sessioni + 1
            
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
            
            comm_header_cell = sheet.cell(row=current_row, column=current_col, value='COMMISSIONE')
            comm_header_cell.font = header_font
            comm_header_cell.alignment = center_alignment
            comm_header_cell.fill = header_fill
            comm_header_cell.border = thin_border
            
            current_row += 1
            
            col_positions = [1]
            data_col = 2
            for tipo_sessione in ordine_sessioni:
                if tipo_sessione in sessioni_dict and sessioni_calendario[tipo_sessione]['inizio']:
                    col_positions.append(data_col)
                    data_col += 1
            col_positions.append(data_col)
            
            for insegnamento in insegnamenti_per_anno[anno_corso]:
                name_cell = sheet.cell(row=current_row, column=1, value=insegnamento['titolo'])
                name_cell.alignment = left_alignment
                name_cell.font = insegnamento_font
                name_cell.border = thin_border
                
                col_index = 0
                for tipo_sessione in ordine_sessioni:
                    if tipo_sessione in sessioni_dict and sessioni_calendario[tipo_sessione]['inizio']:
                        col_index += 1
                        
                        esami_sessione = [
                            esame for esame in insegnamento['esami']
                            if sessioni_calendario[tipo_sessione]['inizio'] <= esame['data_appello'] <= sessioni_calendario[tipo_sessione]['fine']
                        ]
                        
                        if esami_sessione:
                            esami_sessione.sort(key=lambda x: x['data_appello'])
                            date_formattate = [esame['data_appello'].strftime('%d/%m/%Y') for esame in esami_sessione]
                            date_complete = '\n'.join(date_formattate) if len(date_formattate) > 3 else ' - '.join(date_formattate)
                            
                            if col_index < len(col_positions):
                                date_cell = sheet.cell(row=current_row, column=col_positions[col_index], value=date_complete)
                                date_cell.alignment = center_wrap_alignment
                                date_cell.border = thin_border
                        else:
                            if col_index < len(col_positions):
                                empty_cell = sheet.cell(row=current_row, column=col_positions[col_index], value="--")
                                empty_cell.alignment = center_alignment
                                empty_cell.border = thin_border
                
                if len(col_positions) > col_index + 1:
                    comm_cell = sheet.cell(row=current_row, column=col_positions[-1], value="")
                    comm_cell.border = thin_border
                
                current_row += 1
            
            current_row += 1
        
        sheet.column_dimensions['A'].width = 60
        for col_num in range(2, data_col):
            sheet.column_dimensions[get_column_letter(col_num)].width = 40
        if data_col <= 26:
            sheet.column_dimensions[get_column_letter(data_col)].width = 35
        
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