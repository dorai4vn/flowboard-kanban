import type { TaskFilter } from '../domain/filters';
import { visibleColumn } from '../domain/filters';
import { COLUMN_IDS, type Board, type ColumnId } from '../domain/types';
import { Column } from './Column';

type Props = {
  board: Board;
  filter: TaskFilter;
  today: string;
  onAdd: (column: ColumnId) => void;
  onOpen: (id: string) => void;
};

export function BoardView({ board, filter, today, onAdd, onOpen }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMN_IDS.map((c) => (
        <Column
          key={c}
          column={c}
          tasks={visibleColumn(board, c, filter, today)}
          totalCount={board.columns[c].length}
          labels={board.labels}
          today={today}
          onAdd={onAdd}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
