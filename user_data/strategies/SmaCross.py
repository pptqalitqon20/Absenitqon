# pragma: no cover
from freqtrade.strategy import IStrategy, IntParameter
from pandas import DataFrame
import talib.abstract as ta

class SmaCross(IStrategy):
    timeframe = '5m'
    minimal_roi = {"0": 0.02}
    stoploss = -0.03
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.015
    trailing_only_offset_is_reached = True

    sma_fast = IntParameter(5, 20, default=10, optimize=False)
    sma_slow = IntParameter(20, 60, default=30, optimize=False)

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe['sma_fast'] = ta.SMA(dataframe, timeperiod=int(self.sma_fast.value))
        dataframe['sma_slow'] = ta.SMA(dataframe, timeperiod=int(self.sma_slow.value))
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (dataframe['sma_fast'] > dataframe['sma_slow']) &
            (dataframe['sma_fast'].shift(1) <= dataframe['sma_slow'].shift(1)),
            'enter_long'
        ] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (dataframe['sma_fast'] < dataframe['sma_slow']) &
            (dataframe['sma_fast'].shift(1) >= dataframe['sma_slow'].shift(1)),
            'exit_long'
        ] = 1
        return dataframe
